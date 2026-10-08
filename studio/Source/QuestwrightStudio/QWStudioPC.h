#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/PlayerController.h"
#include "QWSpec.h"
#include "QWStudioPC.generated.h"

class ACameraActor;
class AQWStudio;
class SWidget;

/**
 * Drives the character screen: orbit camera, the creator panel, and the
 * character file Questwright writes.
 *
 * Command line:
 *   -Character=<file.json>  load this character and reload it whenever the file changes
 *   -Style=painted|stylized|realistic
 *   -Shots=<folder>         render a portrait and a full-body shot in every style there, then quit
 */
UCLASS()
class AQWStudioPC : public APlayerController
{
	GENERATED_BODY()

public:
	AQWStudioPC();
	virtual void PlayerTick(float DeltaTime) override;

	AQWStudio* GetStudio() const { return Studio; }
	bool IsPortrait() const { return bPortrait; }
	void SetPortrait(bool bOn);
	void SavePortrait();
	void ResetView();
	/** Applies a change made in the panel and remembers it is the author's, not the file's. */
	void Edit(TFunctionRef<void(FQWSpec&)> Change);

protected:
	virtual void BeginPlay() override;

private:
	UPROPERTY() TObjectPtr<AQWStudio> Studio;
	UPROPERTY() TObjectPtr<ACameraActor> ViewCamera;
	TSharedPtr<SWidget> Panel;
	TSharedPtr<class SVerticalBox> GearList;

	float Yaw = 20.f;
	float Pitch = -4.f;
	float Dist = 0.f;
	float GoalDist = 0.f;
	bool bPortrait = false;

	FString CharacterPath;
	FDateTime CharacterStamp;
	float CheckTimer = 0.f;
	FString ShotsDir;
	FString Status;

	void LoadCharacter(bool bInitial);
	void BuildPanel();
	void RefreshGearList();
	void RunShots(int32 Step);
	void UpdateCamera(float DeltaTime, bool bSnap);
	float FullDistance() const;
	float PortraitDistance() const;
};

UCLASS()
class AQWStudioGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AQWStudioGameMode();
};
