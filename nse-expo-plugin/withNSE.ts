import {
  ConfigPlugin,
  withEntitlementsPlist,
  withXcodeProject,
} from "@expo/config-plugins";
import * as fs from 'fs';
import * as path from 'path';
import xcode from 'xcode';

const readFile = (path: string) => {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, data) => {
      if (err || !data) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
}

const writeFile = (path: string, contents: string) => {
  return new Promise<void>((resolve, reject) => {
    fs.writeFile(path, contents, 'utf8', (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

const copyFile = async (path1: string, path2: string) => {
  const fileContents = await readFile(path1);
  await writeFile(path2, fileContents);
}

 export type NSEPluginProps = {
  mode: "development" | "production";
  devTeam: string;
  iPhoneDeploymentTarget: string;
};

export type PluginOptions = {
  iosPath:                  string,
  mode:                     "development" | "production",
  devTeam?:                 string,
  bundleVersion?:           string,
  bundleShortVersion?:      string,
  bundleIdentifier?:        string,
  iPhoneDeploymentTarget?:  string,
}

const withNSE: ConfigPlugin<NSEPluginProps> = (config, props) => {
  withEntitlementsPlist(config, (newConfig) => {
    newConfig.modResults["aps-environment"] = props.mode;
    return newConfig;
  });

  withXcodeProject(config, async configProps => {
    const options: PluginOptions = {
      iosPath: configProps.modRequest.platformProjectRoot,
      bundleIdentifier: configProps.ios?.bundleIdentifier,
      devTeam: props?.devTeam,
      bundleVersion: configProps.ios?.buildNumber,
      bundleShortVersion: configProps?.version,
      mode: props?.mode,
      iPhoneDeploymentTarget: props?.iPhoneDeploymentTarget,
    };

    const pluginDir = require.resolve("native-packages/package.json")

    xcodeProjectAddNse(
      configProps.modRequest.projectName || "",
      options,
      path.join(pluginDir, "../build/")
    );

    return configProps;
  });


  return config;
};


export function xcodeProjectAddNse(
  appName: string,
  options: PluginOptions,
  sourceDir: string
): void {

  const entitlementsFileName =`NotificationServiceExtension.entitlements`;

  const { iosPath, devTeam, bundleIdentifier,  } = options;

  console.log({iosPath})
  console.log({sourceDir})

  const projPath = `${iosPath}/${appName}.xcodeproj/project.pbxproj`;

  const files = [
    "NotificationService.h",
    "NotificationService.m",
    `NotificationServiceExtension.entitlements`,
    `NotificationServiceExtension-Info.plist`
  ];

  const xcodeProject = xcode.project(projPath);

  xcodeProject.parse(async function(err: Error) {
    if (err) {
      console.log(`Error parsing iOS project: ${JSON.stringify(err)}`);
      return;
    }

    fs.mkdirSync(`${iosPath}/NotificationServiceExtension`, { recursive: true });

    const targetFileHeader = `${iosPath}/NotificationServiceExtension/NotificationService.h`;
    await copyFile(`${sourceDir}NotificationService.h`, targetFileHeader);

    const targetFileEntitlements = `${iosPath}/NotificationServiceExtension/NotificationServiceExtension.entitlements`;
    await copyFile(`${sourceDir}NotificationServiceExtension.entitlements`, targetFileEntitlements);

    const targetFilePlist = `${iosPath}/NotificationServiceExtension/NotificationServiceExtension-Info.plist`;
    await copyFile(`${sourceDir}NotificationServiceExtension-Info.plist`, targetFilePlist);

    const sourcePath = `${sourceDir}NotificationService.m`
    const targetFile = `${iosPath}/NotificationServiceExtension/NotificationService.m`;
    await copyFile(`${sourcePath}`, targetFile);

    const entitlementsFilePath = `${iosPath}/NotificationServiceExtension/${entitlementsFileName}`;
    let entitlementsFile = await readFile(entitlementsFilePath);
    entitlementsFile = entitlementsFile.replace(/{{GROUP_IDENTIFIER}}/gm, `group.${bundleIdentifier}.NSE`);
    await writeFile(entitlementsFilePath, entitlementsFile);

    const extGroup = xcodeProject.addPbxGroup(files, "NotificationServiceExtension", "NotificationServiceExtension");

    const groups = xcodeProject.hash.project.objects["PBXGroup"];

    Object.keys(groups).forEach(function(key) {
      if (groups[key].name === undefined) {
        xcodeProject.addToPbxGroup(extGroup.uuid, key);
      }
    });

    const nseTarget = xcodeProject.addTarget("NotificationServiceExtension", "app_extension", "NotificationServiceExtension", `${bundleIdentifier}.NotificationServiceExtension`);

    xcodeProject.addBuildPhase(
      ["NotificationService.m"],
      "PBXSourcesBuildPhase",
      "Sources",
      nseTarget.uuid
    );
    xcodeProject.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", nseTarget.uuid);

    xcodeProject.addBuildPhase(
      [],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      nseTarget.uuid
    );

    xcodeProject.addTargetAttribute("DevelopmentTeam", devTeam, nseTarget);
    xcodeProject.addTargetAttribute("DevelopmentTeam", devTeam);

    fs.writeFileSync(projPath, xcodeProject.writeSync());
  })
}

export default withNSE;
