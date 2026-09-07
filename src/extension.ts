import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    const disposable = vscode.commands.registerCommand(
        'backend-structure-generator.generate',
        async () => {

            vscode.window.showInformationMessage(
                'Backend Structure Generator is working!'
            );

        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}