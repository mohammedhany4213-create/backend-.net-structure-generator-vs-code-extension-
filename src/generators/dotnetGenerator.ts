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
        await execFileAsync('dotnet', args, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
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

export async function generateDotnetCleanArchitecture(options: DotnetGeneratorOptions): Promise<string> {
    if (!isValidProjectName(options.projectName)) {
        throw new Error('Invalid project name. Use letters, numbers, underscores, and dots only, starting with a letter or underscore.');
    }

    const sdkVersion = await ensureDotnetInstalled();
    const projectRoot = path.resolve(options.destination, options.projectName);

    try {
        await fs.access(projectRoot);
        throw new Error(`A folder named "${options.projectName}" already exists at the selected location.`);
    } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        if (error instanceof Error && !('code' in error)) {
            throw error;
        }
    }

    await fs.mkdir(projectRoot, { recursive: true });

    const src = path.join(projectRoot, 'src');
    const tests = path.join(projectRoot, 'tests');
    await fs.mkdir(src, { recursive: true });
    await fs.mkdir(tests, { recursive: true });

    const api = `${options.projectName}.Api`;
    const application = `${options.projectName}.Application`;
    const domain = `${options.projectName}.Domain`;
    const infrastructure = `${options.projectName}.Infrastructure`;
    const unitTests = `${options.projectName}.UnitTests`;
    const integrationTests = `${options.projectName}.IntegrationTests`;

    await runDotnet(['new', 'sln', '--name', options.projectName], projectRoot);
    await runDotnet(['new', 'webapi', '--name', api, '--framework', options.targetFramework, '--use-controllers', '--no-restore'], src);
    await runDotnet(['new', 'classlib', '--name', application, '--framework', options.targetFramework, '--no-restore'], src);
    await runDotnet(['new', 'classlib', '--name', domain, '--framework', options.targetFramework, '--no-restore'], src);
    await runDotnet(['new', 'classlib', '--name', infrastructure, '--framework', options.targetFramework, '--no-restore'], src);
    await runDotnet(['new', 'xunit', '--name', unitTests, '--framework', options.targetFramework, '--no-restore'], tests);
    await runDotnet(['new', 'xunit', '--name', integrationTests, '--framework', options.targetFramework, '--no-restore'], tests);

    const projects = [
        path.join('src', api, `${api}.csproj`),
        path.join('src', application, `${application}.csproj`),
        path.join('src', domain, `${domain}.csproj`),
        path.join('src', infrastructure, `${infrastructure}.csproj`),
        path.join('tests', unitTests, `${unitTests}.csproj`),
        path.join('tests', integrationTests, `${integrationTests}.csproj`),
    ];

    for (const project of projects) {
        await runDotnet(['sln', `${options.projectName}.sln`, 'add', project], projectRoot);
    }

    const references: Array<[string, string[]]> = [
        [path.join('src', application, `${application}.csproj`), [path.join('src', domain, `${domain}.csproj`)]],
        [path.join('src', infrastructure, `${infrastructure}.csproj`), [
            path.join('src', application, `${application}.csproj`),
            path.join('src', domain, `${domain}.csproj`),
        ]],
        [path.join('src', api, `${api}.csproj`), [
            path.join('src', application, `${application}.csproj`),
            path.join('src', infrastructure, `${infrastructure}.csproj`),
        ]],
        [path.join('tests', unitTests, `${unitTests}.csproj`), [
            path.join('src', application, `${application}.csproj`),
            path.join('src', domain, `${domain}.csproj`),
        ]],
        [path.join('tests', integrationTests, `${integrationTests}.csproj`), [
            path.join('src', api, `${api}.csproj`),
        ]],
    ];

    for (const [project, refs] of references) {
        await runDotnet(['add', project, 'reference', ...refs], projectRoot);
    }

    await createFolders(path.join(src, api), [
        'Controllers', 'Middleware', 'Extensions', 'Filters',
    ]);
    await createFolders(path.join(src, application), [
        'DTOs', 'Interfaces', 'Services', 'Features', 'Mappings', 'Common',
    ]);
    await createFolders(path.join(src, domain), [
        'Entities', 'Enums', 'Exceptions', 'Interfaces', 'ValueObjects',
    ]);
    await createFolders(path.join(src, infrastructure), [
        'Data', 'Repositories', 'Services', 'Configurations', 'Migrations',
    ]);
    await createFolders(path.join(tests, unitTests), ['Services', 'Features']);
    await createFolders(path.join(tests, integrationTests), ['Controllers', 'Fixtures']);

    const apiWeatherForecast = path.join(src, api, 'WeatherForecast.cs');
    try { await fs.rm(apiWeatherForecast, { force: true }); } catch { /* ignore */ }

    const readme = `# ${options.projectName}\n\nGenerated by Backend Structure Generator.\n\n## Architecture\n\nClean Architecture\n\n## Target Framework\n\n${options.targetFramework}\n\n## Projects\n\n- ${api}\n- ${application}\n- ${domain}\n- ${infrastructure}\n- ${unitTests}\n- ${integrationTests}\n\n## Run\n\n\\`\\`\\`bash\ndotnet restore\ndotnet build\ndotnet run --project src/${api}\n\\`\\`\\`\n\n.NET SDK detected: ${sdkVersion}\n`;
    await fs.writeFile(path.join(projectRoot, 'README.md'), readme, 'utf8');

    return projectRoot;
}
