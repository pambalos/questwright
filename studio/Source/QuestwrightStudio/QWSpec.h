#pragma once

#include "CoreMinimal.h"

/** How the studio draws the character. */
enum class EQWStyle : uint8
{
	/** A 2D painting: brush strokes, ink lines, paper. */
	Painted,
	/** Stylised 3D in the manner of WoW: banded light, bold colour, rim light. */
	Stylized,
	/** Realistic 3D in the manner of Black Desert: soft global light, glossy materials, shallow focus. */
	Realistic,
};

const TCHAR* QWStyleName(EQWStyle Style);
bool QWParseStyle(const FString& Name, EQWStyle& Out);

/**
 * One worn or held piece, already resolved by Questwright from the story:
 * Type is the figure feature (helm, armor, greaves, weapon...), Material and
 * Kind come from the item's name.
 */
struct FQWGear
{
	FString Type;
	FString Slot;
	FString Item;
	FString Kind;
	FString Material;
	FString Rarity;
};

/** A character as Questwright exports it for the studio. */
struct FQWSpec
{
	FString Name;
	FString Description;
	bool bFeminine = false;
	/** Multipliers on the base body. */
	float Height = 1.f;
	float Build = 1.f;
	FLinearColor Skin = FLinearColor::White;
	FLinearColor Hair = FLinearColor::Black;
	FLinearColor Cloth = FLinearColor::Gray;
	FLinearColor Accent = FLinearColor::Yellow;
	TArray<FQWGear> Gear;

	/** Russ from "Xianxia Nicks Story", in the obsidian set from the last loot box. */
	static FQWSpec Sample();
	static bool Load(const FString& Path, FQWSpec& Out, FString& Error);
};

/** "#rrggbb" in sRGB to linear colour. */
FLinearColor QWHex(const FString& Hex, const FLinearColor& Fallback);
