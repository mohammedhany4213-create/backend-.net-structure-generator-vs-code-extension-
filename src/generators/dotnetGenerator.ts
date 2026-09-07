import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type DotnetVersion = 'net8.0' | 'net9.0' | 'net10.0';

export interface DotnetGeneratorOptions {
    projectName: string;
    targetFramework: DotnetVersion;
    architecture: 'clean';
    destination: string;
}

function isValidProjectName(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name);
}

async function runDotnet(args: string[], cwd: string): Promise<void> {
    try {
        await execFileAsync('dotnet', args, {
            cwd,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`dotnet ${args.join(' ')} failed: ${message}`);
    }
}

async function ensureDotnetInstalled(): Promise<string> {
    try {
        const { stdout } = await execFileAsync('dotnet', ['--version'], { windowsHide: true });
        return stdout.trim();
    } catch {
        throw new Error('The .NET SDK was not found. Install the .NET SDK and make sure "dotnet" is available in PATH.');
    }
}

async function createFolders(projectRoot: string, folders: string[]): Promise<void> {
    await Promise.all(
        folders.map((folder) => fs.mkdir(path.join(projectRoot, folder), { recursive: true })),
    );
}

async function pathExists(target: string): Promise<boolean> {
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
}

export async function generateDotnetCleanArchitecture(options: DotnetGeneratorOptions): Promise<string> {
    if (!isValidProjectName(options.projectName)) {
        throw new Error('Invalid project name. Use letters, numbers, underscores, and dots only, starting with a letter or underscore.');
    }

    await ensureDotnetInstalled();

    const projectRoot = path.resolve(options.destination, options.projectName);
    if (await pathExists(projectRoot)) {
        throw new Error(`A folder named "${options.projectName}" already exists at the selected location.`);
    }

    const src = path.join(projectRoot, 'src');
    await fs.mkdir(src, { recursive: true });

    const api = `${options.projectName}.Api`;
    const application = `${options.projectName}.Application`;
    const domain = `${options.projectName}.Domain`;
    const infrastructure = `${options.projectName}.Infrastructure`;

    await runDotnet(['new', 'sln', '--name', options.projectName], projectRoot);
    await runDotnet(['new', 'webapi', '--name', api, '--framework', options.targetFramework, '--use-controllers'], src);
    await runDotnet(['new', 'classlib', '--name', application, '--framework', options.targetFramework], src);
    await runDotnet(['new', 'classlib', '--name', domain, '--framework', options.targetFramework], src);
    await runDotnet(['new', 'classlib', '--name', infrastructure, '--framework', options.targetFramework], src);

    const projects = [
        path.join('src', api, `${api}.csproj`),
        path.join('src', application, `${application}.csproj`),
        path.join('src', domain, `${domain}.csproj`),
        path.join('src', infrastructure, `${infrastructure}.csproj`),
    ];

    for (const project of projects) {
        await runDotnet(['sln', `${options.projectName}.sln`, 'add', project], projectRoot);
    }

    await runDotnet([
        'add',
        path.join('src', application, `${application}.csproj`),
        'reference',
        path.join('src', domain, `${domain}.csproj`),
    ], projectRoot);

    await runDotnet([
        'add',
        path.join('src', infrastructure, `${infrastructure}.csproj`),
        'reference',
        path.join('src', application, `${application}.csproj`),
        path.join('src', domain, `${domain}.csproj`),
    ], projectRoot);

    await runDotnet([
        'add',
        path.join('src', api, `${api}.csproj`),
        'reference',
        path.join('src', application, `${application}.csproj`),
        path.join('src', infrastructure, `${infrastructure}.csproj`),
    ], projectRoot);

    await createFolders(path.join(src, api), [
        'Controllers',
        'Middleware',
        'Extensions',
    ]);
    await createFolders(path.join(src, application), [
        'DTOs',
        'Interfaces',
        'Services',
        'Features',
        'Mappings',
    ]);
    await createFolders(path.join(src, domain), [
        'Entities',
        'Enums',
        'Exceptions',
        'Interfaces',
        'ValueObjects',
    ]);
    await createFolders(path.join(src, infrastructure), [
        'Data',
        'Repositories',
        'Services',
        'Configurations',
        'Migrations',
    ]);

    const generatedWeatherForecast = path.join(src, api, 'WeatherForecast.cs');
    await fs.rm(generatedWeatherForecast, { force: true });

    await runDotnet(['restore', `${options.projectName}.sln`], projectRoot);
    await runDotnet(['build', `${options.projectName}.sln`, '--no-restore'], projectRoot);

    const readme = `# ${options.projectName}\n\nGenerated by Backend Structure Generator.\n\n## Architecture\n\nClean Architecture\n\n## Target Framework\n\n${options.targetFramework}\n\n## Projects\n\n- ${api}\n- ${application}\n- ${domain}\n- ${infrastructure}\n\n## Build\n\nThe solution was restored and built successfully during generation.\n`;

    await fs.writeFile(path.join(projectRoot, 'README.md'), readme, 'utf8');

    return projectRoot;
}
