using UnrealBuildTool;

public class QuestwrightStudioTarget : TargetRules
{
	public QuestwrightStudioTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
		ExtraModuleNames.Add("QuestwrightStudio");
	}
}
