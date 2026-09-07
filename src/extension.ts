import * as vscode from 'vscode';
import { generateDotnetCleanArchitecture } from './generators/dotnetGenerator';

const DOTNET_VERSIONS = [
    { label: '.NET 10', value: 'net10.0' },
    { label: '.NET 9', value: 'net9.0' },
    { label: '.NET 8', value: 'net8.0' },
] as const;

export function activate(context: vscode.ExtensionContext) {
    console.log('Backend Structure Generator activated!');

    const disposable = vscode.commands.registerCommand(
        'backend-structure-generator.generate',
        async () => {
            try {
                const version = await vscode.window.showQuickPick(DOTNET_VERSIONS, {
                    title: 'Backend Structure Generator',
                    placeHolder: 'Choose .NET version',
                });
                if (!version) return;

                const architecture = await vscode.window.showQuickPick([
                    { label: 'Clean Architecture', value: 'clean' as const },
                ], {
                    title: 'Backend Structure Generator',
                    placeHolder: 'Choose architecture',
                });
                if (!architecture) return;

                const projectType = await vscode.window.showQuickPick([
                    { label: 'ASP.NET Core Web API', value: 'webapi' as const },
                ], {
                    title: 'Backend Structure Generator',
                    placeHolder: 'Choose project type',
                });
                if (!projectType) return;

                const projectName = await vscode.window.showInputBox({
                    title: 'Backend Structure Generator',
                    prompt: 'Enter project name',
                    placeHolder: 'TodoApi',
                    validateInput: (value) => {
                        if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(value.trim())) {
                            return 'Use letters, numbers, underscores, and dots only.';
                        }
                        return undefined;
                    },
                });
                if (!projectName) return;

                const destination = await vscode.window.showOpenDialog({
                    title: 'Choose where to create the project',
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    openLabel: 'Create Project Here',
                });
                if (!destination?.[0]) return;

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Generating ${projectName}...`,
                    cancellable: false,
                }, async (progress) => {
                    progress.report({ message: 'Creating solution and projects...' });

                    const projectRoot = await generateDotnetCleanArchitecture({
                        projectName: projectName.trim(),
                        targetFramework: version.value,
                        architecture: architecture.value,
                        destination: destination[0].fsPath,
                    });

                    const action = await vscode.window.showInformationMessage(
                        `Project ${projectName} created successfully.`,
                        'Open Project',
                    );

                    if (action === 'Open Project') {
                        await vscode.commands.executeCommand(
                            'vscode.openFolder',
                            vscode.Uri.file(projectRoot),
                        );
                    }
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Generation failed: ${message}`);
            }
        },
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
