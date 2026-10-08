#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "QWSpec.h"
#include "QWStudio.generated.h"

class UCameraComponent;
class UDirectionalLightComponent;
class UMaterialInstanceDynamic;
class UMaterialInterface;
class UPostProcessComponent;
class USkeletalMeshComponent;
class USkyLightComponent;
class USpotLightComponent;
class UStaticMesh;
class UStaticMeshComponent;

/**
 * The character screen: a body wearing what the story gave it, lit and drawn
 * in one of three styles. Everything is built in code from engine shapes and
 * the materials Scripts/setup_content.py makes, so the project stays text.
 */
UCLASS()
class AQWStudio : public AActor
{
	GENERATED_BODY()

public:
	AQWStudio();

	void ApplySpec(const FQWSpec& InSpec);
	const FQWSpec& GetSpec() const { return Spec; }

	void SetStyle(EQWStyle InStyle);
	EQWStyle GetStyle() const { return Style; }

	void SetGearVisible(bool bVisible);
	bool IsGearVisible() const { return bGearVisible; }

	/** Where the camera looks: the chest for the full body, the face for a portrait. */
	FVector Focus(bool bPortrait) const;
	/** Focus distance for depth of field in the realistic style. */
	void SetFocusDistance(float Cm);

protected:
	virtual void BeginPlay() override;

private:
	UPROPERTY() TObjectPtr<USkeletalMeshComponent> Body;
	UPROPERTY() TObjectPtr<UDirectionalLightComponent> Key;
	UPROPERTY() TObjectPtr<USpotLightComponent> Rim;
	UPROPERTY() TObjectPtr<USpotLightComponent> Fill;
	UPROPERTY() TObjectPtr<USkyLightComponent> Sky;
	UPROPERTY() TObjectPtr<UPostProcessComponent> Post;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Backdrop;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Floor;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> Parts;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> GearParts;
	UPROPERTY() TObjectPtr<UMaterialInterface> GearMaterial;
	UPROPERTY() TObjectPtr<UMaterialInterface> PaintedPP;
	UPROPERTY() TObjectPtr<UMaterialInterface> ToonPP;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> BackdropMID;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> FloorMID;
	UPROPERTY() TObjectPtr<UStaticMesh> Cube;
	UPROPERTY() TObjectPtr<UStaticMesh> Sphere;
	UPROPERTY() TObjectPtr<UStaticMesh> Cylinder;
	UPROPERTY() TObjectPtr<UStaticMesh> Cone;

	FQWSpec Spec;
	EQWStyle Style = EQWStyle::Stylized;
	bool bGearVisible = true;
	bool bBuilt = false;

	void Rebuild();
	void BuildBody();
	void BuildOutfit();
	void BuildGear(const FQWGear& G);
	void ApplyStyleLook();

	FVector Bone(FName Name) const;
	UMaterialInstanceDynamic* Mat(const FString& Material, const FString& Fallback, const FString& Rarity = TEXT("")) const;
	UMaterialInstanceDynamic* Trim(const FString& Material, const FString& Rarity) const;

	/** A shape sized in centimetres (full extents), placed in world space and carried by a bone from then on. */
	UStaticMeshComponent* Place(UStaticMesh* Mesh, FName Attach, const FVector& At, const FRotator& Rot, const FVector& SizeCm, UMaterialInstanceDynamic* M, bool bGear);
	/** A shape stretched along the bone from A towards B, between fractions From and To of its length. */
	UStaticMeshComponent* Segment(UStaticMesh* Mesh, FName A, FName B, float From, float To, float Width, float Depth, UMaterialInstanceDynamic* M, bool bGear);
};
