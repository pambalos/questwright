#include "QWStudio.h"

#include "Animation/AnimSequence.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/TextureCube.h"
#include "EngineUtils.h"
#include "Components/LightComponentBase.h"
#include "Engine/ExponentialHeightFog.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	const FVector Fwd = FVector::ForwardVector; // The character faces +X.
	const FVector Up = FVector::UpVector;

	FLinearColor Hex(const TCHAR* H) { return QWHex(H, FLinearColor::White); }

	FLinearColor RarityColor(const FString& R)
	{
		if (R == TEXT("uncommon")) return Hex(TEXT("#62c07a"));
		if (R == TEXT("rare")) return Hex(TEXT("#5b9bf0"));
		if (R == TEXT("epic")) return Hex(TEXT("#b07ae6"));
		if (R == TEXT("legendary")) return Hex(TEXT("#f0a64a"));
		return FLinearColor::Black;
	}

	template <typename T>
	T* Load(const TCHAR* Path)
	{
		return LoadObject<T>(nullptr, Path);
	}

	/** Horizontal part of a vector, normalised. */
	FVector Flat(FVector V)
	{
		V.Z = 0;
		return V.GetSafeNormal();
	}
}

AQWStudio::AQWStudio()
{
	PrimaryActorTick.bCanEverTick = false;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));

	Body = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(RootComponent);
	Body->SetRelativeRotation(FRotator(0, -90, 0)); // Mannequins face +Y; the studio faces +X.
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->bCastDynamicShadow = true;

	Key = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Key"));
	Key->SetupAttachment(RootComponent);
	Key->SetMobility(EComponentMobility::Movable);

	Rim = CreateDefaultSubobject<USpotLightComponent>(TEXT("Rim"));
	Rim->SetupAttachment(RootComponent);
	Rim->SetMobility(EComponentMobility::Movable);

	Fill = CreateDefaultSubobject<USpotLightComponent>(TEXT("Fill"));
	Fill->SetupAttachment(RootComponent);
	Fill->SetMobility(EComponentMobility::Movable);

	Sky = CreateDefaultSubobject<USkyLightComponent>(TEXT("Sky"));
	Sky->SetupAttachment(RootComponent);
	Sky->SetMobility(EComponentMobility::Movable);

	Post = CreateDefaultSubobject<UPostProcessComponent>(TEXT("Post"));
	Post->SetupAttachment(RootComponent);
	Post->bUnbound = true;

	Backdrop = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Backdrop"));
	Backdrop->SetupAttachment(RootComponent);
	Backdrop->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Backdrop->SetCastShadow(false);
	Backdrop->SetRelativeScale3D(FVector(60));

	Floor = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Floor"));
	Floor->SetupAttachment(RootComponent);
	Floor->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Floor->SetRelativeLocation(FVector(0, 0, -2));
	Floor->SetRelativeScale3D(FVector(3.2f, 3.2f, 0.04f));
}

void AQWStudio::BeginPlay()
{
	Super::BeginPlay();
	// The studio is the whole scene: clear whatever the startup map brought (its floor, lights, fog).
	for (TActorIterator<AActor> It(GetWorld()); It; ++It)
	{
		AActor* A = *It;
		if (A == this) continue;
		if (A->FindComponentByClass<UPrimitiveComponent>() || A->FindComponentByClass<ULightComponentBase>() || A->IsA<AExponentialHeightFog>()) A->Destroy();
	}
	Cube = Load<UStaticMesh>(TEXT("/Engine/BasicShapes/Cube.Cube"));
	Sphere = Load<UStaticMesh>(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	Cylinder = Load<UStaticMesh>(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	Cone = Load<UStaticMesh>(TEXT("/Engine/BasicShapes/Cone.Cone"));
	GearMaterial = Load<UMaterialInterface>(TEXT("/Game/Studio/M_Gear.M_Gear"));
	PaintedPP = Load<UMaterialInterface>(TEXT("/Game/Studio/PP_Painted.PP_Painted"));
	ToonPP = Load<UMaterialInterface>(TEXT("/Game/Studio/PP_Toon.PP_Toon"));
	if (UMaterialInterface* BackdropMat = Load<UMaterialInterface>(TEXT("/Game/Studio/M_Backdrop.M_Backdrop")))
	{
		BackdropMID = UMaterialInstanceDynamic::Create(BackdropMat, this);
	}
	Backdrop->SetStaticMesh(Sphere);
	Backdrop->SetMaterial(0, BackdropMID);
	Floor->SetStaticMesh(Cylinder);
	FloorMID = Mat(TEXT("stone"), TEXT("stone"));
	Floor->SetMaterial(0, FloorMID);

	if (UTextureCube* Cubemap = Load<UTextureCube>(TEXT("/Engine/MapTemplates/Sky/SunsetAmbientCubemap.SunsetAmbientCubemap")))
	{
		Sky->SourceType = ESkyLightSourceType::SLS_SpecifiedCubemap;
		Sky->SetCubemap(Cubemap);
	}

	Key->SetWorldRotation(FRotator(-38, 145, 0)); // From the front left, above.
	Rim->SetWorldLocation(FVector(-260, -120, 260));
	Rim->SetWorldRotation((FVector(0, 0, 110) - FVector(-260, -120, 260)).Rotation());
	Rim->SetIntensityUnits(ELightUnits::Candelas);
	Rim->SetAttenuationRadius(3000);
	Rim->SetOuterConeAngle(35);
	Fill->SetWorldLocation(FVector(300, 220, 140));
	Fill->SetWorldRotation((FVector(0, 0, 110) - FVector(300, 220, 140)).Rotation());
	Fill->SetIntensityUnits(ELightUnits::Candelas);
	Fill->SetAttenuationRadius(3000);
	Fill->SetOuterConeAngle(45);
	Fill->SetCastShadows(false);

	bBuilt = true;
	if (Spec.Name.IsEmpty()) Spec = FQWSpec::Sample();
	Rebuild();
	SetStyle(Style);
}

void AQWStudio::ApplySpec(const FQWSpec& InSpec)
{
	Spec = InSpec;
	if (bBuilt) Rebuild();
}

void AQWStudio::SetGearVisible(bool bVisible)
{
	bGearVisible = bVisible;
	for (UStaticMeshComponent* C : GearParts)
	{
		if (C) C->SetVisibility(bVisible);
	}
}

FVector AQWStudio::Bone(FName Name) const
{
	return Body->GetBoneLocation(Name, EBoneSpaces::WorldSpace);
}

FVector AQWStudio::Focus(bool bPortrait) const
{
	return bPortrait ? Bone(TEXT("head")) + Up * 9 : (Bone(TEXT("spine_02")) + Bone(TEXT("pelvis"))) * 0.5f;
}

void AQWStudio::Rebuild()
{
	for (UStaticMeshComponent* C : Parts)
	{
		if (C) C->DestroyComponent();
	}
	for (UStaticMeshComponent* C : GearParts)
	{
		if (C) C->DestroyComponent();
	}
	Parts.Reset();
	GearParts.Reset();
	BuildBody();
	BuildOutfit();
	for (const FQWGear& G : Spec.Gear) BuildGear(G);
}

void AQWStudio::BuildBody()
{
	const bool bFem = Spec.bFeminine;
	USkeletalMesh* Mesh = Load<USkeletalMesh>(bFem ? TEXT("/Game/Characters/Mannequins/Meshes/SKM_Quinn.SKM_Quinn") : TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny.SKM_Manny"));
	UAnimSequence* Idle = Load<UAnimSequence>(bFem ? TEXT("/Game/Characters/Mannequins/Animations/Quinn/MF_Idle.MF_Idle") : TEXT("/Game/Characters/Mannequins/Animations/Manny/MM_Idle.MM_Idle"));
	if (Mesh && Body->GetSkeletalMeshAsset() != Mesh) Body->SetSkeletalMeshAsset(Mesh);
	const float W = Spec.Height * Spec.Build;
	Body->SetRelativeScale3D(FVector(W, W, Spec.Height));
	UMaterialInstanceDynamic* Skin = Mat(TEXT("skin"), TEXT("skin"));
	for (int32 i = 0; i < Body->GetNumMaterials(); ++i) Body->SetMaterial(i, Skin);
	if (Idle && Body->GetSingleNodeInstance() == nullptr)
	{
		Body->SetAnimationMode(EAnimationMode::AnimationSingleNode);
		Body->PlayAnimation(Idle, true);
	}
	// Shapes are fitted to the pose the bones are in right now.
	Body->TickAnimation(0.f, false);
	Body->RefreshBoneTransforms();
}

/* ---------- materials ---------- */

UMaterialInstanceDynamic* AQWStudio::Mat(const FString& Material, const FString& Fallback, const FString& Rarity) const
{
	if (!GearMaterial) return nullptr;
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(GearMaterial, const_cast<AQWStudio*>(this));
	const FString K = Material.IsEmpty() ? Fallback : Material;
	FLinearColor Base = Hex(TEXT("#b8bec8"));
	float Metal = 1, Rough = 0.3f, Coat = 0, CoatRough = 0.1f, Specular = 0.5f;
	FLinearColor Sheen = FLinearColor::Black;
	if (K == TEXT("obsidian")) { Base = Hex(TEXT("#0f0d16")); Metal = 0.15f; Rough = 0.12f; Coat = 1; CoatRough = 0.03f; Specular = 0.9f; Sheen = FLinearColor(0.10f, 0.05f, 0.22f); }
	else if (K == TEXT("iron")) { Base = Hex(TEXT("#5c5e64")); Metal = 0.9f; Rough = 0.55f; }
	else if (K == TEXT("gold")) { Base = Hex(TEXT("#d6a443")); Metal = 1; Rough = 0.3f; }
	else if (K == TEXT("silver")) { Base = Hex(TEXT("#dfe6ee")); Metal = 1; Rough = 0.18f; }
	else if (K == TEXT("bronze")) { Base = Hex(TEXT("#a8703a")); Metal = 1; Rough = 0.38f; }
	else if (K == TEXT("leather")) { Base = Hex(TEXT("#5a3a22")); Metal = 0; Rough = 0.72f; }
	else if (K == TEXT("cloth")) { Base = Spec.Cloth; Metal = 0; Rough = 0.95f; Specular = 0.2f; }
	else if (K == TEXT("bone")) { Base = Hex(TEXT("#e6dcc4")); Metal = 0; Rough = 0.6f; }
	else if (K == TEXT("wood")) { Base = Hex(TEXT("#5b3b22")); Metal = 0; Rough = 0.65f; }
	else if (K == TEXT("crystal")) { Base = Hex(TEXT("#bfe4ff")); Metal = 0; Rough = 0.05f; Coat = 1; Sheen = FLinearColor(0.1f, 0.2f, 0.3f); }
	else if (K == TEXT("skin")) { Base = Spec.Skin; Metal = 0; Rough = 0.55f; Specular = 0.35f; }
	else if (K == TEXT("hair")) { Base = Spec.Hair; Metal = 0; Rough = 0.6f; Specular = 0.6f; }
	else if (K == TEXT("paint")) { Base = Spec.Accent; Metal = 0; Rough = 0.55f; }
	else if (K == TEXT("stone")) { Base = Hex(TEXT("#3a3d46")); Metal = 0; Rough = 0.85f; }
	const FLinearColor Glow = RarityColor(Rarity);
	if (!Glow.Equals(FLinearColor::Black)) Sheen = Glow * 2.5f;
	M->SetVectorParameterValue(TEXT("BaseColor"), Base);
	M->SetScalarParameterValue(TEXT("Metallic"), Metal);
	M->SetScalarParameterValue(TEXT("Roughness"), Rough);
	M->SetScalarParameterValue(TEXT("Specular"), Specular);
	M->SetScalarParameterValue(TEXT("ClearCoat"), Coat);
	M->SetScalarParameterValue(TEXT("ClearCoatRoughness"), CoatRough);
	M->SetVectorParameterValue(TEXT("Sheen"), Sheen);
	return M;
}

UMaterialInstanceDynamic* AQWStudio::Trim(const FString& Material, const FString& Rarity) const
{
	if (!RarityColor(Rarity).Equals(FLinearColor::Black))
	{
		UMaterialInstanceDynamic* M = Mat(TEXT("gold"), TEXT("gold"));
		if (M) M->SetVectorParameterValue(TEXT("Emissive"), RarityColor(Rarity) * 4.f);
		return M;
	}
	if (Material == TEXT("obsidian"))
	{
		UMaterialInstanceDynamic* M = Mat(TEXT("iron"), TEXT("iron"));
		if (M) M->SetVectorParameterValue(TEXT("BaseColor"), Hex(TEXT("#2a2433")));
		return M;
	}
	return Mat(Material == TEXT("leather") || Material == TEXT("cloth") ? TEXT("bronze") : TEXT("gold"), TEXT("gold"));
}

/* ---------- shapes ---------- */

UStaticMeshComponent* AQWStudio::Place(UStaticMesh* Mesh, FName Attach, const FVector& At, const FRotator& Rot, const FVector& SizeCm, UMaterialInstanceDynamic* M, bool bGear)
{
	if (!Mesh) return nullptr;
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetMobility(EComponentMobility::Movable);
	C->SetStaticMesh(Mesh);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetMaterial(0, M);
	C->RegisterComponent();
	C->SetWorldTransform(FTransform(Rot, At, SizeCm / 100.f));
	C->AttachToComponent(Body, FAttachmentTransformRules::KeepWorldTransform, Attach);
	if (bGear)
	{
		C->SetVisibility(bGearVisible);
		GearParts.Add(C);
	}
	else
	{
		Parts.Add(C);
	}
	return C;
}

UStaticMeshComponent* AQWStudio::Segment(UStaticMesh* Mesh, FName A, FName B, float From, float To, float Width, float Depth, UMaterialInstanceDynamic* M, bool bGear)
{
	const FVector PA = Bone(A);
	const FVector PB = Bone(B);
	const float Len = FVector::Dist(PA, PB);
	if (Len < 1) return nullptr;
	const FVector Dir = (PB - PA) / Len;
	const FVector Ref = FMath::Abs(Dir | Fwd) > 0.9f ? Up : Fwd;
	const FRotator Rot = FRotationMatrix::MakeFromZX(Dir, Ref).Rotator();
	return Place(Mesh, A, PA + Dir * Len * (From + To) * 0.5f, Rot, FVector(Depth, Width, Len * (To - From)), M, bGear);
}

/* ---------- the body underneath: clothes and hair ---------- */

void AQWStudio::BuildOutfit()
{
	UMaterialInstanceDynamic* Cloth = Mat(TEXT("cloth"), TEXT("cloth"));
	UMaterialInstanceDynamic* Dark = Mat(TEXT("leather"), TEXT("leather"));
	const float Span = FVector::Dist(Bone(TEXT("upperarm_l")), Bone(TEXT("upperarm_r")));
	// Tunic and sleeves; armour on the chest replaces the tunic's body.
	const bool bArmoured = Spec.Gear.ContainsByPredicate([](const FQWGear& G) { return G.Type == TEXT("armor"); });
	if (!bArmoured) Segment(Cylinder, TEXT("pelvis"), TEXT("neck_01"), -0.1f, 0.92f, Span * 1.12f, Span * 0.92f, Cloth, false);
	for (const TCHAR* S : {TEXT("l"), TEXT("r")})
	{
		const FName Upper(*FString::Printf(TEXT("upperarm_%s"), S));
		const FName Lower(*FString::Printf(TEXT("lowerarm_%s"), S));
		const FName Thigh(*FString::Printf(TEXT("thigh_%s"), S));
		const FName Calf(*FString::Printf(TEXT("calf_%s"), S));
		const FName Foot(*FString::Printf(TEXT("foot_%s"), S));
		Segment(Cylinder, Upper, Lower, -0.05f, 0.7f, 13.5f, 13.5f, Cloth, false);
		Segment(Cylinder, Thigh, Calf, -0.05f, 1.02f, 21.5f, 21.5f, Cloth, false);
		Segment(Cylinder, Calf, Foot, 0.f, 0.75f, 15.5f, 15.5f, Cloth, false);
		// Plain shoes; armoured boots go over them.
		const FVector Ball = Bone(*FString::Printf(TEXT("ball_%s"), S));
		const FVector Heel = Bone(Foot);
		const FVector Along = Flat(Ball - Heel);
		Place(Cube, Foot, (Heel + Ball) * 0.5f - Up * 3.5f, FRotationMatrix::MakeFromXZ(Along, Up).Rotator(), FVector(FVector::Dist(Heel, Ball) + 9, 10, 8), Dark, false);
	}
	// Belt.
	Place(Cylinder, TEXT("pelvis"), Bone(TEXT("pelvis")) + Up * 7, FRotator::ZeroRotator, FVector(Span * 0.7f, Span * 1.0f, 5), Dark, false);
	// Hair, unless the head is covered.
	const bool bCovered = Spec.Gear.ContainsByPredicate([](const FQWGear& G) { return G.Type == TEXT("helm") || G.Type == TEXT("hood"); });
	if (!bCovered)
	{
		const FVector Skull = Bone(TEXT("head")) + Up * 10 + Fwd * 1;
		Place(Sphere, TEXT("head"), Skull + Up * 5 - Fwd * 2, FRotator::ZeroRotator, FVector(24, 22, 17), Mat(TEXT("hair"), TEXT("hair")), false);
	}
}

/* ---------- gear ---------- */

void AQWStudio::BuildGear(const FQWGear& G)
{
	const FString& T = G.Type;
	const FString Fallback = (T == TEXT("gloves") || T == TEXT("boots") || T == TEXT("bracers") || T == TEXT("pack")) ? TEXT("leather") : TEXT("steel");
	UMaterialInstanceDynamic* Shell = Mat(G.Material, Fallback, G.Rarity);
	UMaterialInstanceDynamic* Edge = Trim(G.Material, G.Rarity);
	const float Span = FVector::Dist(Bone(TEXT("upperarm_l")), Bone(TEXT("upperarm_r")));
	const FVector Skull = Bone(TEXT("head")) + Up * 10 + Fwd * 1;

	if (T == TEXT("helm"))
	{
		// A closed great helm over the whole head, with an eye slit and a crest.
		Place(Sphere, TEXT("head"), Skull - Up * 2 + Fwd * 3, FRotator::ZeroRotator, FVector(31, 23.5f, 30), Shell, true);
		Place(Cube, TEXT("head"), Skull + Fwd * 18 + Up * 1, FRotator::ZeroRotator, FVector(2, 14, 1.8f), Mat(TEXT("stone"), TEXT("stone")), true); // Eye slit.
		Place(Cube, TEXT("head"), Skull + Up * 13, FRotator::ZeroRotator, FVector(24, 2.2f, 3.5f), Edge, true);  // Crest.
		Segment(Cylinder, TEXT("neck_01"), TEXT("head"), -0.2f, 0.75f, 18.5f, 17, Shell, true);                  // Gorget.
	}
	else if (T == TEXT("hood"))
	{
		Place(Sphere, TEXT("head"), Skull + Up * 2 - Fwd * 2.5f, FRotator::ZeroRotator, FVector(29, 28, 29), Shell, true);
	}
	else if (T == TEXT("armor") || T == TEXT("pauldrons"))
	{
		if (T == TEXT("armor"))
		{
			const float W = Span * 1.2f;
			const float D = Span * 1.0f;
			// A rounded cuirass over the chest, a narrower plated waist below it.
			const FVector Chest = (Bone(TEXT("spine_03")) + Bone(TEXT("spine_05"))) * 0.5f + Up * 2;
			const float ChestH = FVector::Dist(Bone(TEXT("spine_02")), Bone(TEXT("neck_01"))) * 1.15f;
			Place(Sphere, TEXT("spine_04"), Chest, FRotator::ZeroRotator, FVector(D * 1.02f, W, ChestH), Shell, true);
			Segment(Cylinder, TEXT("pelvis"), TEXT("spine_03"), 0.15f, 1.f, W * 0.86f, D * 0.84f, Shell, true);
			for (float F : {0.4f, 0.7f}) Segment(Cylinder, TEXT("pelvis"), TEXT("spine_03"), F, F + 0.05f, W * 0.88f, D * 0.86f, Edge, true);
			Place(Cube, TEXT("spine_04"), Chest + Fwd * (D * 0.5f) - Up * 2, FRotator::ZeroRotator, FVector(2, 2.6f, ChestH * 0.6f), Edge, true); // Ridge.
			// Tassets over the hips.
			const FVector Pelvis = Bone(TEXT("pelvis"));
			Place(Cube, TEXT("pelvis"), Pelvis + Fwd * (D * 0.45f) - Up * 8, FRotator(-8, 0, 0), FVector(2.2f, Span * 0.62f, 17), Shell, true);
			for (const TCHAR* S : {TEXT("thigh_l"), TEXT("thigh_r")})
			{
				const FVector Out = Flat(Bone(S) - Pelvis);
				Place(Cube, TEXT("pelvis"), Bone(S) + Out * 10 - Up * 6, FRotationMatrix::MakeFromXZ(Out, Up).Rotator(), FVector(2.2f, 17, 16), Shell, true);
			}
		}
		for (const TCHAR* S : {TEXT("upperarm_l"), TEXT("upperarm_r")})
		{
			const FVector Out = Flat(Bone(S) - Bone(TEXT("spine_05")));
			Place(Sphere, S, Bone(S) + Up * 5 + Out * 3, FRotationMatrix::MakeFromXZ(Fwd, Up).Rotator(), FVector(21, 23, 15), Shell, true);
			Place(Cylinder, S, Bone(S) + Up * 2 + Out * 3, FRotator::ZeroRotator, FVector(22, 24, 1.6f), Edge, true);
		}
	}
	else if (T == TEXT("gloves") || T == TEXT("bracers"))
	{
		for (const TCHAR* S : {TEXT("l"), TEXT("r")})
		{
			const FName Lower(*FString::Printf(TEXT("lowerarm_%s"), S));
			const FName Hand(*FString::Printf(TEXT("hand_%s"), S));
			if (T == TEXT("bracers"))
			{
				Segment(Cylinder, Lower, Hand, 0.25f, 0.85f, 10.5f, 10.5f, Shell, true);
				continue;
			}
			Segment(Cylinder, Lower, Hand, 0.6f, 1.04f, 11.5f, 11.5f, Shell, true);
			const FVector D = (Bone(Hand) - Bone(Lower)).GetSafeNormal();
			Place(Cube, Hand, Bone(Hand) + D * 5.5f, FRotationMatrix::MakeFromXZ(D, Up).Rotator(), FVector(11, 10, 6.5f), Shell, true);
		}
	}
	else if (T == TEXT("greaves"))
	{
		for (const TCHAR* S : {TEXT("l"), TEXT("r")})
		{
			const FName Thigh(*FString::Printf(TEXT("thigh_%s"), S));
			const FName Calf(*FString::Printf(TEXT("calf_%s"), S));
			const FName Foot(*FString::Printf(TEXT("foot_%s"), S));
			Segment(Cylinder, Thigh, Calf, 0.1f, 0.9f, 23.5f, 23.5f, Shell, true);
			Place(Sphere, Calf, Bone(Calf) + Fwd * 5.5f, FRotator::ZeroRotator, FVector(13, 16, 14), Shell, true);
			Segment(Cylinder, Calf, Foot, 0.08f, 0.8f, 18, 18, Shell, true);
			Segment(Cylinder, Calf, Foot, 0.1f, 0.13f, 18.6f, 18.6f, Edge, true);
		}
	}
	else if (T == TEXT("boots"))
	{
		for (const TCHAR* S : {TEXT("l"), TEXT("r")})
		{
			const FName Calf(*FString::Printf(TEXT("calf_%s"), S));
			const FName Foot(*FString::Printf(TEXT("foot_%s"), S));
			const FVector Ball = Bone(*FString::Printf(TEXT("ball_%s"), S));
			const FVector Heel = Bone(Foot);
			const FVector Along = Flat(Ball - Heel);
			Place(Cube, Foot, (Heel + Ball) * 0.5f - Up * 3 + Along * 1.5f, FRotationMatrix::MakeFromXZ(Along, Up).Rotator(), FVector(FVector::Dist(Heel, Ball) + 13, 12, 10.5f), Shell, true);
			Segment(Cylinder, Calf, Foot, 0.7f, 1.06f, 18.5f, 18.5f, Shell, true);
		}
	}
	else if (T == TEXT("shield"))
	{
		const FVector Lower = Bone(TEXT("lowerarm_l"));
		const FVector Hand = Bone(TEXT("hand_l"));
		const FVector D = (Hand - Lower).GetSafeNormal();
		FVector Out = (Lower + Hand) * 0.5f - Bone(TEXT("spine_03"));
		Out = (Out - D * (Out | D)).GetSafeNormal();
		const FVector C = (Lower + Hand) * 0.5f + Out * 12;
		const FRotator R = FRotationMatrix::MakeFromZX(Out, D).Rotator();
		UMaterialInstanceDynamic* Face = G.Material.IsEmpty() ? Mat(TEXT("paint"), TEXT("paint"), G.Rarity) : Shell;
		Place(Cylinder, TEXT("lowerarm_l"), C - Out * 0.8f, R, FVector(54, 47, 2.6f), Edge, true);
		Place(Cylinder, TEXT("lowerarm_l"), C, R, FVector(50, 43, 3.6f), Face, true);
		Place(Sphere, TEXT("lowerarm_l"), C + Out * 2.2f, R, FVector(11, 11, 6), Edge, true);
	}
	else if (T == TEXT("pack"))
	{
		const FVector Back = Bone(TEXT("spine_04"));
		Place(Cube, TEXT("spine_04"), Back - Fwd * 19 - Up * 4, FRotator::ZeroRotator, FVector(15, 31, 38), Shell, true);
		Place(Cylinder, TEXT("spine_04"), Back - Fwd * 19 + Up * 20, FRotator(0, 0, 90), FVector(13, 13, 36), Mat(TEXT("cloth"), TEXT("cloth")), true);
	}
	else if (T == TEXT("cape"))
	{
		const FVector Neck = Bone(TEXT("spine_05"));
		Place(Cube, TEXT("spine_05"), Neck - Fwd * 15 - Up * 52, FRotator(-6, 0, 0), FVector(2, Span * 1.2f, 108), Mat(TEXT("paint"), TEXT("paint"), G.Rarity), true);
	}
	else if (T == TEXT("weapon"))
	{
		// Held in the right hand: the shaft runs across the fist, forwards.
		const FVector Hand = Bone(TEXT("hand_r"));
		const FVector D = (Hand - Bone(TEXT("lowerarm_r"))).GetSafeNormal();
		// At rest: hammers, blades and maces hang down along the leg; polearms and staves stand upright.
		const bool bUpright = G.Kind == TEXT("spear") || G.Kind == TEXT("staff") || G.Kind == TEXT("bow");
		const FVector Shaft = bUpright ? (Up * 0.97f + Fwd * 0.25f).GetSafeNormal() : (D + Fwd * 0.12f).GetSafeNormal();
		const FVector Grip = Hand + D * 7;
		const FRotator R = FRotationMatrix::MakeFromZX(Shaft, Fwd).Rotator();
		UMaterialInstanceDynamic* Wood = Mat(TEXT("wood"), TEXT("wood"));
		UMaterialInstanceDynamic* Metal = G.Material.IsEmpty() ? Mat(TEXT("steel"), TEXT("steel"), G.Rarity) : Shell;
		const FString& K = G.Kind;
		auto Along = [&](float Cm) { return Grip + Shaft * Cm; };
		if (K == TEXT("hammer"))
		{
			Place(Cylinder, TEXT("hand_r"), Along(20), R, FVector(3.4f, 3.4f, 76), Wood, true);
			Place(Cube, TEXT("hand_r"), Along(56), R, FVector(25, 11, 12), Metal, true);
			for (float S : {-1.f, 1.f}) Place(Cube, TEXT("hand_r"), Along(56) + R.RotateVector(FVector(S * 12.8f, 0, 0)), R, FVector(1.5f, 12.5f, 13.5f), Edge, true);
		}
		else if (K == TEXT("axe"))
		{
			Place(Cylinder, TEXT("hand_r"), Along(25), R, FVector(3.2f, 3.2f, 80), Wood, true);
			Place(Cube, TEXT("hand_r"), Along(56) + R.RotateVector(FVector(9, 0, 0)), R, FVector(18, 1.8f, 16), Metal, true);
		}
		else if (K == TEXT("spear"))
		{
			Place(Cylinder, TEXT("hand_r"), Along(30), R, FVector(3, 3, 190), Wood, true);
			Place(Cone, TEXT("hand_r"), Along(133), R, FVector(6, 2.5f, 22), Metal, true);
		}
		else if (K == TEXT("mace"))
		{
			Place(Cylinder, TEXT("hand_r"), Along(18), R, FVector(3, 3, 56), Mat(TEXT("leather"), TEXT("leather")), true);
			Place(Sphere, TEXT("hand_r"), Along(48), R, FVector(13, 13, 13), Metal, true);
		}
		else if (K == TEXT("staff") || K == TEXT("bow"))
		{
			Place(Cylinder, TEXT("hand_r"), Along(25), R, FVector(3.2f, 3.2f, 170), Wood, true);
			UMaterialInstanceDynamic* Orb = Mat(TEXT("crystal"), TEXT("crystal"), G.Rarity);
			if (Orb) Orb->SetVectorParameterValue(TEXT("Emissive"), FLinearColor(0.4f, 1.2f, 2.5f));
			Place(Sphere, TEXT("hand_r"), Along(112), R, FVector(9, 9, 9), Orb, true);
		}
		else if (K == TEXT("focus"))
		{
			UMaterialInstanceDynamic* Orb = Mat(TEXT("crystal"), TEXT("crystal"), G.Rarity);
			if (Orb) Orb->SetVectorParameterValue(TEXT("Emissive"), FLinearColor(0.4f, 1.2f, 2.5f));
			Place(Sphere, TEXT("hand_r"), Grip + Up * 14, FRotator::ZeroRotator, FVector(10, 10, 10), Orb, true);
		}
		else
		{
			// Swords, daggers and anything unknown: a blade.
			const float L = K == TEXT("dagger") ? 26.f : 82.f;
			Place(Cylinder, TEXT("hand_r"), Along(0), R, FVector(3.2f, 3.2f, 14), Mat(TEXT("leather"), TEXT("leather")), true);
			Place(Cube, TEXT("hand_r"), Along(7.5f), R, FVector(22, 3.5f, 2.6f), Edge, true);
			Place(Cube, TEXT("hand_r"), Along(8 + L * 0.5f), R, FVector(6, 1.1f, L), Metal, true);
		}
	}
}

/* ---------- styles ---------- */

void AQWStudio::SetStyle(EQWStyle InStyle)
{
	Style = InStyle;
	if (bBuilt) ApplyStyleLook();
}

void AQWStudio::SetFocusDistance(float Cm)
{
	Post->Settings.bOverride_DepthOfFieldFocalDistance = true;
	Post->Settings.DepthOfFieldFocalDistance = Cm;
}

void AQWStudio::ApplyStyleLook()
{
	FPostProcessSettings& P = Post->Settings;
	const float Dof = P.DepthOfFieldFocalDistance;
	P = FPostProcessSettings();
	P.bOverride_DepthOfFieldFocalDistance = true;
	P.DepthOfFieldFocalDistance = Dof > 0 ? Dof : 400.f;
	// Fixed exposure, so each style's lighting reads the same every time.
	P.bOverride_AutoExposureMethod = true;
	P.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
	P.bOverride_AutoExposureApplyPhysicalCameraExposure = true;
	P.AutoExposureApplyPhysicalCameraExposure = 0;
	P.bOverride_AutoExposureBias = true;
	P.bOverride_BloomIntensity = true;
	P.bOverride_VignetteIntensity = true;
	P.bOverride_ColorSaturation = true;
	P.bOverride_ColorContrast = true;
	P.bOverride_DepthOfFieldFstop = true;
	P.DepthOfFieldFstop = 22.f;

	FLinearColor Top, Bottom;
	switch (Style)
	{
	case EQWStyle::Painted:
		P.AutoExposureBias = 0.4f;
		P.BloomIntensity = 0.f;
		P.VignetteIntensity = 0.f;
		P.ColorSaturation = FVector4(0.9f, 0.9f, 0.9f, 1);
		P.ColorContrast = FVector4(0.95f, 0.95f, 0.95f, 1);
		if (PaintedPP) P.AddBlendable(PaintedPP, 1.f);
		Key->SetIntensity(2.2f);
		Key->SetLightColor(Hex(TEXT("#fff1dc")));
		Rim->SetIntensity(3.f);
		Rim->SetLightColor(Hex(TEXT("#ffe8c8")));
		Fill->SetIntensity(5.f);
		Sky->SetIntensity(1.2f);
		Top = Hex(TEXT("#efe3c8"));
		Bottom = Hex(TEXT("#c6ae86"));
		break;
	case EQWStyle::Stylized:
		P.AutoExposureBias = 0.2f;
		P.BloomIntensity = 0.5f;
		P.VignetteIntensity = 0.5f;
		P.ColorSaturation = FVector4(1.35f, 1.35f, 1.35f, 1);
		P.ColorContrast = FVector4(1.1f, 1.1f, 1.1f, 1);
		if (ToonPP) P.AddBlendable(ToonPP, 1.f);
		Key->SetIntensity(4.5f);
		Key->SetLightColor(Hex(TEXT("#ffd9a8")));
		Rim->SetIntensity(45.f);
		Rim->SetLightColor(Hex(TEXT("#7fb2ff")));
		Fill->SetIntensity(4.f);
		Sky->SetIntensity(0.7f);
		Top = Hex(TEXT("#2a3c6e"));
		Bottom = Hex(TEXT("#0b0f1d"));
		break;
	default:
		P.AutoExposureBias = 0.f;
		P.BloomIntensity = 0.6f;
		P.VignetteIntensity = 0.45f;
		P.ColorSaturation = FVector4(1.05f, 1.05f, 1.05f, 1);
		P.ColorContrast = FVector4(1.05f, 1.05f, 1.05f, 1);
		P.DepthOfFieldFstop = 2.2f;
		P.bOverride_FilmGrainIntensity = true;
		P.FilmGrainIntensity = 0.15f;
		Key->SetIntensity(4.2f);
		Key->SetLightColor(Hex(TEXT("#fff4e6")));
		Rim->SetIntensity(18.f);
		Rim->SetLightColor(Hex(TEXT("#cfe0ff")));
		Fill->SetIntensity(4.f);
		Sky->SetIntensity(0.8f);
		Top = Hex(TEXT("#2b2e34"));
		Bottom = Hex(TEXT("#08090b"));
		break;
	}
	if (FloorMID) FloorMID->SetVectorParameterValue(TEXT("BaseColor"), Style == EQWStyle::Painted ? Hex(TEXT("#b39a74")) : Style == EQWStyle::Stylized ? Hex(TEXT("#2c3550")) : Hex(TEXT("#2a2b2e")));
	if (BackdropMID)
	{
		BackdropMID->SetVectorParameterValue(TEXT("Top"), Top);
		BackdropMID->SetVectorParameterValue(TEXT("Bottom"), Bottom);
	}
	Sky->RecaptureSky();
}
