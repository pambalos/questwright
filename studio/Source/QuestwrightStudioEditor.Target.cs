using UnrealBuildTool;

public class QuestwrightStudioEditorTarget : TargetRules
{
	public QuestwrightStudioEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
		ExtraModuleNames.Add("QuestwrightStudio");
	}
}
