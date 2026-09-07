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

async function findSolutionFile(projectRoot: string, projectName: string): Promise<string> {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true });
    const solution = entries.find(
        (entry) => entry.isFile() && (entry.name.endsWith('.sln') || entry.name.endsWith('.slnx')),
    );

    if (!solution) {
        throw new Error(`Could not find the generated solution file for ${projectName}.`);
    }

    return solution.name;
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
    const solutionFile = await findSolutionFile(projectRoot, options.projectName);

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
        await runDotnet(['sln', solutionFile, 'add', project], projectRoot);
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

    await fs.rm(path.join(src, api, 'WeatherForecast.cs'), { force: true });
    await fs.rm(path.join(src, api, 'Controllers', 'WeatherForecastController.cs'), { force: true });

    await runDotnet(['restore', solutionFile], projectRoot);
    await runDotnet(['build', solutionFile, '--no-restore'], projectRoot);

    const readme = `# ${options.projectName}\n\nGenerated by Backend Structure Generator.\n\n## Architecture\n\nClean Architecture\n\n## Target Framework\n\n${options.targetFramework}\n\n## Projects\n\n- ${api}\n- ${application}\n- ${domain}\n- ${infrastructure}\n\n## Build\n\nThe solution was restored and built successfully during generation.\n`;

    await fs.writeFile(path.join(projectRoot, 'README.md'), readme, 'utf8');

    return projectRoot;
}
