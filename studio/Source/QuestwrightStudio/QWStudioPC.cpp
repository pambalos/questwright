#include "QWStudioPC.h"

#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/FileManager.h"
#include "Misc/CommandLine.h"
#include "Misc/Paths.h"
#include "QWStudio.h"
#include "Styling/CoreStyle.h"
#include "TimerManager.h"
#include "UnrealClient.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SCheckBox.h"
#include "Widgets/Input/SSlider.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Text/STextBlock.h"

namespace
{
	const FLinearColor Gold(0.84f, 0.55f, 0.13f);
	const FLinearColor Ink(0.91f, 0.89f, 0.84f);
	const FLinearColor Dim(0.55f, 0.58f, 0.66f);
	const FLinearColor Off(0.13f, 0.14f, 0.19f);
	const float Fov = 40.f;

	FSlateFontInfo Font(int32 Size, bool bBold = false) { return FCoreStyle::GetDefaultFontStyle(bBold ? "Bold" : "Regular", Size); }

	TSharedRef<STextBlock> Heading(const TCHAR* Text)
	{
		return SNew(STextBlock).Text(FText::FromString(Text)).Font(Font(9, true)).ColorAndOpacity(Gold);
	}

	FLinearColor Rarity(const FString& R)
	{
		if (R == TEXT("uncommon")) return QWHex(TEXT("#62c07a"), Ink);
		if (R == TEXT("rare")) return QWHex(TEXT("#5b9bf0"), Ink);
		if (R == TEXT("epic")) return QWHex(TEXT("#b07ae6"), Ink);
		if (R == TEXT("legendary")) return QWHex(TEXT("#f0a64a"), Ink);
		return Ink;
	}

	const TArray<FString> SkinTones = {TEXT("#f3d2b8"), TEXT("#e0b18f"), TEXT("#c99a78"), TEXT("#a47052"), TEXT("#7a4d33"), TEXT("#4f3022"), TEXT("#a8b9a0"), TEXT("#9fb4cc")};
	const TArray<FString> HairTones = {TEXT("#1b1512"), TEXT("#2b2118"), TEXT("#5a3a22"), TEXT("#a8763e"), TEXT("#d9b36c"), TEXT("#b8b8c0"), TEXT("#8a2a1e"), TEXT("#3b4a8a")};
	const TArray<FString> ClothTones = {TEXT("#7a5a2a"), TEXT("#5b2a2a"), TEXT("#2a3f5b"), TEXT("#2f4a32"), TEXT("#4a3a5e"), TEXT("#d8d0bc"), TEXT("#2b2b30"), TEXT("#a8762a")};
}

AQWStudioGameMode::AQWStudioGameMode()
{
	PlayerControllerClass = AQWStudioPC::StaticClass();
	DefaultPawnClass = nullptr;
}

AQWStudioPC::AQWStudioPC()
{
	bShowMouseCursor = true;
	// The studio's own camera is the view; without a pawn the engine would otherwise look from the controller.
	bAutoManageActiveCameraTarget = false;
}

void AQWStudioPC::BeginPlay()
{
	Super::BeginPlay();
	if (!IsLocalController()) return;

	Studio = GetWorld()->SpawnActor<AQWStudio>();
	ViewCamera = GetWorld()->SpawnActor<ACameraActor>();
	ViewCamera->GetCameraComponent()->SetFieldOfView(Fov);
	ViewCamera->GetCameraComponent()->bConstrainAspectRatio = false;
	SetViewTarget(ViewCamera);

	FString StyleName;
	EQWStyle Style;
	if (FParse::Value(FCommandLine::Get(), TEXT("-Style="), StyleName) && QWParseStyle(StyleName, Style)) Studio->SetStyle(Style);
	FParse::Value(FCommandLine::Get(), TEXT("-Character="), CharacterPath);
	FParse::Value(FCommandLine::Get(), TEXT("-Shots="), ShotsDir);
	LoadCharacter(true);

	FInputModeGameAndUI Mode;
	Mode.SetHideCursorDuringCapture(false);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	BuildPanel();

	GoalDist = Dist = FullDistance();
	UpdateCamera(0.f, true);
	if (!ShotsDir.IsEmpty())
	{
		FTimerHandle H;
		GetWorldTimerManager().SetTimer(H, [this] { RunShots(0); }, 2.0f, false);
	}
}

/* ---------- the character file ---------- */

void AQWStudioPC::LoadCharacter(bool bInitial)
{
	if (CharacterPath.IsEmpty())
	{
		if (bInitial) Status = TEXT("Showing the sample. Open a character from Questwright to see yours.");
		return;
	}
	FQWSpec Spec;
	FString Error;
	if (FQWSpec::Load(CharacterPath, Spec, Error))
	{
		CharacterStamp = IFileManager::Get().GetTimeStamp(*CharacterPath);
		Studio->ApplySpec(Spec);
		Status = FString::Printf(TEXT("Live from Questwright: %s"), *FPaths::GetCleanFilename(CharacterPath));
		RefreshGearList();
	}
	else
	{
		Status = Error;
	}
}

void AQWStudioPC::Edit(TFunctionRef<void(FQWSpec&)> Change)
{
	if (!Studio) return;
	FQWSpec S = Studio->GetSpec();
	Change(S);
	Studio->ApplySpec(S);
}

/* ---------- camera ---------- */

/** Unreal's field of view is horizontal: the vertical half-angle depends on the window's shape. */
static float VerticalHalfTan()
{
	FVector2D Size(16, 9);
	if (GEngine && GEngine->GameViewport) GEngine->GameViewport->GetViewportSize(Size);
	const float Aspect = Size.Y > 0 ? Size.X / Size.Y : 16.f / 9.f;
	return FMath::Tan(FMath::DegreesToRadians(Fov * 0.5f)) / Aspect;
}

float AQWStudioPC::FullDistance() const
{
	const float Height = Studio ? 200.f * Studio->GetSpec().Height : 200.f;
	return Height * 0.5f / VerticalHalfTan() * 1.08f;
}

float AQWStudioPC::PortraitDistance() const
{
	return 30.f / VerticalHalfTan();
}

void AQWStudioPC::SetPortrait(bool bOn)
{
	bPortrait = bOn;
	GoalDist = bOn ? PortraitDistance() : FullDistance();
}

void AQWStudioPC::ResetView()
{
	Yaw = 20.f;
	Pitch = -4.f;
	SetPortrait(bPortrait);
}

void AQWStudioPC::UpdateCamera(float DeltaTime, bool bSnap)
{
	if (!Studio || !ViewCamera) return;
	if (GetViewTarget() != ViewCamera) SetViewTarget(ViewCamera);
	Dist = bSnap ? GoalDist : FMath::FInterpTo(Dist, GoalDist, DeltaTime, 8.f);
	const FVector Focus = Studio->Focus(bPortrait);
	const FRotator Orbit(-Pitch, Yaw, 0);
	const FVector Back = Orbit.Vector();
	// The panel covers the left of the screen, so the character stands right of centre.
	const FVector Right = FRotationMatrix(FRotator(0, Yaw + 90, 0)).GetUnitAxis(EAxis::X);
	const FVector Shift = Right * (Dist * 0.07f);
	ViewCamera->SetActorLocation(Focus + Back * Dist + Shift);
	ViewCamera->SetActorRotation((Focus + Shift - (Focus + Back * Dist + Shift)).Rotation());
	Studio->SetFocusDistance(Dist);
}

void AQWStudioPC::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	if (!Studio) return;

	const bool bOverPanel = Panel.IsValid() && Panel->IsHovered();
	if (!bOverPanel && (IsInputKeyDown(EKeys::LeftMouseButton) || IsInputKeyDown(EKeys::RightMouseButton)))
	{
		float DX = 0, DY = 0;
		GetInputMouseDelta(DX, DY);
		Yaw += DX * 2.2f;
		Pitch = FMath::Clamp(Pitch + DY * 1.6f, -40.f, 35.f);
	}
	if (!bOverPanel && WasInputKeyJustPressed(EKeys::MouseScrollUp)) GoalDist = FMath::Max(70.f, GoalDist * 0.88f);
	if (!bOverPanel && WasInputKeyJustPressed(EKeys::MouseScrollDown)) GoalDist = FMath::Min(FullDistance() * 1.5f, GoalDist / 0.88f);
	UpdateCamera(DeltaTime, false);

	// Questwright rewrites the character file when the story changes it.
	CheckTimer += DeltaTime;
	if (!CharacterPath.IsEmpty() && CheckTimer > 1.f)
	{
		CheckTimer = 0.f;
		const FDateTime Stamp = IFileManager::Get().GetTimeStamp(*CharacterPath);
		if (Stamp != CharacterStamp && Stamp != FDateTime::MinValue()) LoadCharacter(false);
	}
}

/* ---------- portraits ---------- */

void AQWStudioPC::SavePortrait()
{
	if (!Studio) return;
	const FString Dir = FPaths::ProjectSavedDir() / TEXT("Portraits");
	const FString File = Dir / FString::Printf(TEXT("%s_%s_%s.png"), *Studio->GetSpec().Name, QWStyleName(Studio->GetStyle()), *FDateTime::Now().ToString(TEXT("%Y%m%d-%H%M%S")));
	FScreenshotRequest::RequestScreenshot(File, false, false);
	Status = FString::Printf(TEXT("Saved %s"), *FPaths::ConvertRelativePathToFull(File));
}

void AQWStudioPC::RunShots(int32 Step)
{
	// The screen with the panel, then a full-body and a portrait shot per style, then quit.
	static const EQWStyle Styles[] = {EQWStyle::Painted, EQWStyle::Stylized, EQWStyle::Realistic};
	if (Step > 6)
	{
		FTimerHandle H;
		GetWorldTimerManager().SetTimer(H, [] { FPlatformMisc::RequestExit(false); }, 1.0f, false);
		return;
	}
	const EQWStyle Style = Step == 0 ? EQWStyle::Stylized : Styles[(Step - 1) / 2];
	const bool bShotPortrait = Step > 0 && (Step - 1) % 2 == 1;
	const FString Name = Step == 0 ? TEXT("ui") : FString::Printf(TEXT("%s_%s"), QWStyleName(Style), bShotPortrait ? TEXT("portrait") : TEXT("body"));
	Studio->SetStyle(Style);
	SetPortrait(bShotPortrait);
	UpdateCamera(0.f, true);
	// Let lighting settle, take the shot, and only change the scene once it has been written.
	FTimerHandle Take;
	GetWorldTimerManager().SetTimer(Take, [this, Step, Name] {
		FScreenshotRequest::RequestScreenshot(ShotsDir / Name + TEXT(".png"), Step == 0, false);
		FTimerHandle Next;
		GetWorldTimerManager().SetTimer(Next, [this, Step] { RunShots(Step + 1); }, 0.5f, false);
	}, 1.6f, false);
}

/* ---------- the creator panel ---------- */

void AQWStudioPC::RefreshGearList()
{
	if (!GearList.IsValid() || !Studio) return;
	GearList->ClearChildren();
	const TArray<FQWGear>& Gear = Studio->GetSpec().Gear;
	if (Gear.IsEmpty())
	{
		GearList->AddSlot().AutoHeight()[SNew(STextBlock).Text(FText::FromString(TEXT("Nothing worn yet."))).Font(Font(10)).ColorAndOpacity(Dim)];
	}
	for (const FQWGear& G : Gear)
	{
		GearList->AddSlot().AutoHeight().Padding(0, 1)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1)[SNew(STextBlock).Text(FText::FromString(G.Item)).Font(Font(10)).ColorAndOpacity(Rarity(G.Rarity))]
			+ SHorizontalBox::Slot().AutoWidth()[SNew(STextBlock).Text(FText::FromString(G.Slot)).Font(Font(9)).ColorAndOpacity(Dim)]
		];
	}
}

void AQWStudioPC::BuildPanel()
{
	if (!GEngine || !GEngine->GameViewport) return;
	TWeakObjectPtr<AQWStudioPC> Self(this);
	const FSlateBrush* White = FCoreStyle::Get().GetBrush("WhiteBrush");

	auto Choice = [Self](TFunction<bool()> IsOn, TFunction<void()> Pick, const FString& Label, const FString& Sub) -> TSharedRef<SWidget>
	{
		return SNew(SButton)
			.ButtonColorAndOpacity_Lambda([IsOn] { return IsOn() ? Gold : Off; })
			.ContentPadding(FMargin(10, 6))
			.OnClicked_Lambda([Pick] { Pick(); return FReply::Handled(); })
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Text(FText::FromString(Label)).Font(Font(11, true)).ColorAndOpacity(Ink)]
				+ SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Visibility(Sub.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible).Text(FText::FromString(Sub)).Font(Font(9)).ColorAndOpacity(Dim)]
			];
	};
	auto StyleChoice = [Self, Choice](EQWStyle S, const FString& Label, const FString& Sub)
	{
		return Choice([Self, S] { return Self.IsValid() && Self->Studio && Self->Studio->GetStyle() == S; }, [Self, S] { if (Self.IsValid() && Self->Studio) Self->Studio->SetStyle(S); }, Label, Sub);
	};
	auto Swatches = [Self, White](const TArray<FString>& Tones, TFunction<void(FQWSpec&, const FLinearColor&)> Set) -> TSharedRef<SWidget>
	{
		TSharedRef<SWrapBox> Box = SNew(SWrapBox).UseAllottedSize(true);
		for (const FString& T : Tones)
		{
			const FLinearColor C = QWHex(T, FLinearColor::White);
			Box->AddSlot().Padding(0, 0, 5, 5)
			[
				SNew(SButton).ContentPadding(2).ButtonColorAndOpacity(FLinearColor(0.3f, 0.32f, 0.4f))
				.OnClicked_Lambda([Self, C, Set] { if (Self.IsValid()) Self->Edit([&](FQWSpec& S) { Set(S, C); }); return FReply::Handled(); })
				[SNew(SBox).WidthOverride(24).HeightOverride(24)[SNew(SImage).Image(White).ColorAndOpacity(C)]]
			];
		}
		return Box;
	};
	auto Slider = [Self](const TCHAR* Label, float Min, float Max, TFunction<float(const FQWSpec&)> Get, TFunction<void(FQWSpec&, float)> Set) -> TSharedRef<SWidget>
	{
		return SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 8, 0)[SNew(SBox).WidthOverride(56)[SNew(STextBlock).Text(FText::FromString(Label)).Font(Font(10)).ColorAndOpacity(Ink)]]
			+ SHorizontalBox::Slot().FillWidth(1)
			[
				SNew(SSlider)
				.Value_Lambda([Self, Get, Min, Max] { return Self.IsValid() && Self->Studio ? (Get(Self->Studio->GetSpec()) - Min) / (Max - Min) : 0.5f; })
				.OnValueChanged_Lambda([Self, Set, Min, Max](float V) { if (Self.IsValid()) Self->Edit([&](FQWSpec& S) { Set(S, Min + V * (Max - Min)); }); })
			];
	};
	auto Section = [](const TCHAR* Title, TSharedRef<SWidget> Body) -> TSharedRef<SWidget>
	{
		return SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 14, 0, 6)[Heading(Title)]
			+ SVerticalBox::Slot().AutoHeight()[Body];
	};

	Panel =
		SNew(SBorder)
		.BorderImage(White)
		.BorderBackgroundColor(FLinearColor(0.03f, 0.035f, 0.05f, 0.82f))
		.Padding(FMargin(18, 16))
		[
			SNew(SBox).WidthOverride(310)
			[
				SNew(SScrollBox)
				+ SScrollBox::Slot()
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Text(FText::FromString(TEXT("QUESTWRIGHT STUDIO"))).Font(Font(9, true)).ColorAndOpacity(Dim)]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)[SNew(STextBlock).Text_Lambda([Self] { return FText::FromString(Self.IsValid() && Self->Studio ? Self->Studio->GetSpec().Name : FString()); }).Font(Font(22, true)).ColorAndOpacity(Ink)]
					+ SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).AutoWrapText(true).Text_Lambda([Self] { return FText::FromString(Self.IsValid() && Self->Studio ? Self->Studio->GetSpec().Description : FString()); }).Font(Font(10)).ColorAndOpacity(Dim)]
					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("ART STYLE"),
						SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)[StyleChoice(EQWStyle::Painted, TEXT("Painted"), TEXT("2D painting: brush strokes and ink"))]
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)[StyleChoice(EQWStyle::Stylized, TEXT("Stylized"), TEXT("3D: bold colour and rim light, WoW-like"))]
						+ SVerticalBox::Slot().AutoHeight()[StyleChoice(EQWStyle::Realistic, TEXT("Realistic"), TEXT("3D: soft light and gloss, Black Desert-like"))])]
					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("BODY"),
						SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
						[
							SNew(SHorizontalBox)
							+ SHorizontalBox::Slot().FillWidth(1).Padding(0, 0, 4, 0)[Choice([Self] { return Self.IsValid() && Self->Studio && !Self->Studio->GetSpec().bFeminine; }, [Self] { if (Self.IsValid()) Self->Edit([](FQWSpec& S) { S.bFeminine = false; }); }, TEXT("Masculine"), TEXT(""))]
							+ SHorizontalBox::Slot().FillWidth(1)[Choice([Self] { return Self.IsValid() && Self->Studio && Self->Studio->GetSpec().bFeminine; }, [Self] { if (Self.IsValid()) Self->Edit([](FQWSpec& S) { S.bFeminine = true; }); }, TEXT("Feminine"), TEXT(""))]
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 2)[Slider(TEXT("Height"), 0.85f, 1.15f, [](const FQWSpec& S) { return S.Height; }, [](FQWSpec& S, float V) { S.Height = V; })]
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 2)[Slider(TEXT("Build"), 0.85f, 1.25f, [](const FQWSpec& S) { return S.Build; }, [](FQWSpec& S, float V) { S.Build = V; })])]
					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("SKIN"), Swatches(SkinTones, [](FQWSpec& S, const FLinearColor& C) { S.Skin = C; }))]
					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("HAIR"), Swatches(HairTones, [](FQWSpec& S, const FLinearColor& C) { S.Hair = C; }))]
					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("CLOTHES"), Swatches(ClothTones, [](FQWSpec& S, const FLinearColor& C) { S.Cloth = C; }))]
					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("GEAR FROM THE STORY"),
						SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight()[SAssignNew(GearList, SVerticalBox)]
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 0)
						[
							SNew(SCheckBox)
							.IsChecked_Lambda([Self] { return Self.IsValid() && Self->Studio && Self->Studio->IsGearVisible() ? ECheckBoxState::Checked : ECheckBoxState::Unchecked; })
							.OnCheckStateChanged_Lambda([Self](ECheckBoxState State) { if (Self.IsValid() && Self->Studio) Self->Studio->SetGearVisible(State == ECheckBoxState::Checked); })
							[SNew(STextBlock).Text(FText::FromString(TEXT("Show gear"))).Font(Font(10)).ColorAndOpacity(Ink)]
						])]
					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("CAMERA"),
						SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)
						[
							SNew(SHorizontalBox)
							+ SHorizontalBox::Slot().FillWidth(1).Padding(0, 0, 4, 0)[Choice([Self] { return Self.IsValid() && !Self->IsPortrait(); }, [Self] { if (Self.IsValid()) Self->SetPortrait(false); }, TEXT("Full body"), TEXT(""))]
							+ SHorizontalBox::Slot().FillWidth(1)[Choice([Self] { return Self.IsValid() && Self->IsPortrait(); }, [Self] { if (Self.IsValid()) Self->SetPortrait(true); }, TEXT("Portrait"), TEXT(""))]
						]
						+ SVerticalBox::Slot().AutoHeight()
						[
							SNew(SHorizontalBox)
							+ SHorizontalBox::Slot().FillWidth(1).Padding(0, 0, 4, 0)[Choice([] { return false; }, [Self] { if (Self.IsValid()) Self->ResetView(); }, TEXT("Reset view"), TEXT(""))]
							+ SHorizontalBox::Slot().FillWidth(1)[Choice([] { return false; }, [Self] { if (Self.IsValid()) Self->SavePortrait(); }, TEXT("Save portrait"), TEXT(""))]
						])]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 14, 0, 0)[SNew(STextBlock).AutoWrapText(true).Text_Lambda([Self] { return FText::FromString(Self.IsValid() ? Self->Status : FString()); }).Font(Font(9)).ColorAndOpacity(Dim)]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 0)[SNew(STextBlock).AutoWrapText(true).Text(FText::FromString(TEXT("Drag to turn the character. Scroll to zoom."))).Font(Font(9)).ColorAndOpacity(Dim)]
				]
			]
		];

	GEngine->GameViewport->AddViewportWidgetContent(
		SNew(SOverlay) + SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Fill).Padding(16)[Panel.ToSharedRef()], 10);
	RefreshGearList();
}
