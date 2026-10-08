using UnrealBuildTool;

public class QuestwrightStudio : ModuleRules
{
	public QuestwrightStudio(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore", "Slate", "SlateCore", "Json" });
	}
}
