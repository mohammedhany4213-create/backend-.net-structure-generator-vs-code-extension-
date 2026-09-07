import * as vscode from 'vscode';
import {
    generateDotnetCleanArchitecture,
    generateDotnetNLayeredArchitecture,
    generateDotnetSimpleArchitecture,
    generateDotnetVerticalSliceArchitecture,
} from './generators/dotnetGenerator';

const DOTNET_VERSIONS = [
    { label: '.NET 10', value: 'net10.0' },
    { label: '.NET 9', value: 'net9.0' },
    { label: '.NET 8', value: 'net8.0' },
] as const;

const ARCHITECTURES = [
    { label: 'Simple / Folder-Based', description: 'One project with normal folders, no layers', value: 'simple' as const },
    { label: 'Clean Architecture', value: 'clean' as const },
    { label: 'N-Layered Architecture', value: 'nlayered' as const },
    { label: 'Vertical Slice Architecture', value: 'vertical-slice' as const },
] as const;

const PROJECT_TYPES = [
    { label: 'ASP.NET Core Web API', value: 'webapi' as const },
    { label: 'Worker Service', value: 'worker' as const },
    { label: 'Console Application', value: 'console' as const },
] as const;

const API_STYLES = [
    { label: 'Controllers', description: 'Traditional Controller-based API', value: 'controllers' as const },
    { label: 'Minimal API', description: 'Endpoint-based API with minimal ceremony', value: 'minimal' as const },
] as const;

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('backend-structure-generator.generate', async () => {
        try {
            const version = await vscode.window.showQuickPick(DOTNET_VERSIONS, {
                title: 'Backend Structure Generator', placeHolder: 'Choose .NET version',
            });
            if (!version) return;

            const architecture = await vscode.window.showQuickPick(ARCHITECTURES, {
                title: 'Backend Structure Generator', placeHolder: 'Choose architecture',
            });
            if (!architecture) return;

            const projectType = await vscode.window.showQuickPick(PROJECT_TYPES, {
                title: 'Backend Structure Generator', placeHolder: 'Choose project type',
            });
            if (!projectType) return;

            let apiStyle: (typeof API_STYLES)[number]['value'] | undefined;
            if (projectType.value === 'webapi') {
                const selectedStyle = await vscode.window.showQuickPick(API_STYLES, {
                    title: 'Backend Structure Generator', placeHolder: 'Choose API style',
                });
                if (!selectedStyle) return;
                apiStyle = selectedStyle.value;
            }

            const projectName = await vscode.window.showInputBox({
                title: 'Backend Structure Generator', prompt: 'Enter project name', placeHolder: 'TodoApi',
                validateInput: (value) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value.trim())
                    ? undefined : 'Use letters, numbers, underscores, and dots only.',
            });
            if (!projectName) return;

            const destination = await vscode.window.showOpenDialog({
                title: 'Choose where to create the project', canSelectFolders: true,
                canSelectFiles: false, canSelectMany: false, openLabel: 'Create Project Here',
            });
            if (!destination?.[0]) return;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Generating ${projectName.trim()}...`, cancellable: false,
            }, async (progress) => {
                progress.report({ message: 'Creating .NET projects and folders...' });
                const options = {
                    projectName: projectName.trim(), targetFramework: version.value,
                    architecture: architecture.value, projectType: projectType.value,
                    apiStyle, destination: destination[0].fsPath,
                } as const;

                let projectRoot: string;
                if (architecture.value === 'simple') {
                    projectRoot = await generateDotnetSimpleArchitecture(options);
                } else if (architecture.value === 'clean') {
                    projectRoot = await generateDotnetCleanArchitecture(options);
                } else if (architecture.value === 'nlayered') {
                    projectRoot = await generateDotnetNLayeredArchitecture(options);
                } else {
                    projectRoot = await generateDotnetVerticalSliceArchitecture(options);
                }

                const action = await vscode.window.showInformationMessage(
                    `Project ${projectName.trim()} created and built successfully.`, 'Open Project',
                );
                if (action === 'Open Project') {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectRoot));
                }
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Generation failed: ${message}`);
        }
    });
    context.subscriptions.push(disposable);
}

export function deactivate() {}
