#include "QWSpec.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

const TCHAR* QWStyleName(EQWStyle Style)
{
	switch (Style)
	{
	case EQWStyle::Painted: return TEXT("painted");
	case EQWStyle::Stylized: return TEXT("stylized");
	default: return TEXT("realistic");
	}
}

bool QWParseStyle(const FString& Name, EQWStyle& Out)
{
	for (EQWStyle S : {EQWStyle::Painted, EQWStyle::Stylized, EQWStyle::Realistic})
	{
		if (Name.Equals(QWStyleName(S), ESearchCase::IgnoreCase))
		{
			Out = S;
			return true;
		}
	}
	return false;
}

FLinearColor QWHex(const FString& Hex, const FLinearColor& Fallback)
{
	FString H = Hex.TrimStartAndEnd();
	H.RemoveFromStart(TEXT("#"));
	if (H.Len() != 6) return Fallback;
	for (TCHAR C : H)
	{
		if (!FChar::IsHexDigit(C)) return Fallback;
	}
	return FLinearColor(FColor::FromHex(H));
}

static FQWGear MakeGear(const TCHAR* Type, const TCHAR* Slot, const TCHAR* Item, const TCHAR* Material, const TCHAR* Kind = TEXT(""))
{
	FQWGear G;
	G.Type = Type;
	G.Slot = Slot;
	G.Item = Item;
	G.Material = Material;
	G.Kind = Kind;
	G.Rarity = TEXT("common");
	return G;
}

FQWSpec FQWSpec::Sample()
{
	FQWSpec S;
	S.Name = TEXT("Russ");
	S.Description = TEXT("Army veteran in debt. Qi Warden.");
	S.Skin = QWHex(TEXT("#c99a78"), S.Skin);
	S.Hair = QWHex(TEXT("#2b2118"), S.Hair);
	S.Cloth = QWHex(TEXT("#7a5a2a"), S.Cloth);
	S.Accent = QWHex(TEXT("#d6a443"), S.Accent);
	S.Build = 1.05f;
	S.Gear = {
		MakeGear(TEXT("helm"), TEXT("Head"), TEXT("Obsidian helmet"), TEXT("obsidian")),
		MakeGear(TEXT("armor"), TEXT("Chest"), TEXT("Obsidian chestplate"), TEXT("obsidian")),
		MakeGear(TEXT("gloves"), TEXT("Hands"), TEXT("Obsidian gloves"), TEXT("obsidian")),
		MakeGear(TEXT("greaves"), TEXT("Legs"), TEXT("Obsidian legs"), TEXT("obsidian")),
		MakeGear(TEXT("boots"), TEXT("Feet"), TEXT("Obsidian boots"), TEXT("obsidian")),
		MakeGear(TEXT("weapon"), TEXT("Main hand"), TEXT("Hammer"), TEXT(""), TEXT("hammer")),
		MakeGear(TEXT("shield"), TEXT("Off hand"), TEXT("Shield"), TEXT("")),
		MakeGear(TEXT("pack"), TEXT("Back"), TEXT("Pack"), TEXT("leather")),
	};
	return S;
}

bool FQWSpec::Load(const FString& Path, FQWSpec& Out, FString& Error)
{
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path))
	{
		Error = FString::Printf(TEXT("Could not read %s"), *Path);
		return false;
	}
	TSharedPtr<FJsonObject> Root;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) || !Root.IsValid())
	{
		Error = FString::Printf(TEXT("%s is not a character file"), *Path);
		return false;
	}
	FQWSpec S;
	S.Name = Root->GetStringField(TEXT("name"));
	Root->TryGetStringField(TEXT("description"), S.Description);
	FString Frame;
	if (Root->TryGetStringField(TEXT("frame"), Frame)) S.bFeminine = Frame.Equals(TEXT("feminine"), ESearchCase::IgnoreCase);
	double Num = 0;
	if (Root->TryGetNumberField(TEXT("height"), Num)) S.Height = FMath::Clamp(static_cast<float>(Num), 0.8f, 1.2f);
	if (Root->TryGetNumberField(TEXT("build"), Num)) S.Build = FMath::Clamp(static_cast<float>(Num), 0.8f, 1.3f);
	FString Hex;
	if (Root->TryGetStringField(TEXT("skin"), Hex)) S.Skin = QWHex(Hex, S.Skin);
	if (Root->TryGetStringField(TEXT("hairColor"), Hex)) S.Hair = QWHex(Hex, S.Hair);
	if (Root->TryGetStringField(TEXT("cloth"), Hex)) S.Cloth = QWHex(Hex, S.Cloth);
	if (Root->TryGetStringField(TEXT("accent"), Hex)) S.Accent = QWHex(Hex, S.Accent);
	const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
	if (Root->TryGetArrayField(TEXT("gear"), Items))
	{
		for (const TSharedPtr<FJsonValue>& V : *Items)
		{
			const TSharedPtr<FJsonObject> O = V->AsObject();
			if (!O.IsValid()) continue;
			FQWGear G;
			O->TryGetStringField(TEXT("type"), G.Type);
			O->TryGetStringField(TEXT("slot"), G.Slot);
			O->TryGetStringField(TEXT("item"), G.Item);
			O->TryGetStringField(TEXT("kind"), G.Kind);
			O->TryGetStringField(TEXT("material"), G.Material);
			O->TryGetStringField(TEXT("rarity"), G.Rarity);
			if (!G.Type.IsEmpty()) S.Gear.Add(G);
		}
	}
	Out = MoveTemp(S);
	return true;
}
