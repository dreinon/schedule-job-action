import * as ghActions from '@actions/core';
import { actionInputs } from './actionInputs';
import { actionOutputs } from './actionOutputs';
import { getWorkspacePath } from "github-actions-utils";
import * as fs from "fs";
import * as path from "path";
import { modifyScheduledWorkflow } from "./modifyScheduledWorkflow";
import { context, GitHub } from "@actions/github";
import { Octokit } from '@octokit/rest';
import {octokitHandle404} from "./octokitHandle404";
import {consts} from "./consts";

const WORKFLOWS_DIR = '.github/workflows';

// noinspection JSUnusedLocalSymbols
async function run(): Promise<void> {
    try {
        await runImpl();
    } catch (error) {
        ghActions.setFailed(error.message);
    }
}

async function runImpl() {
    if (process.env.GITHUB_SHA === undefined) {
        throw new Error('GITHUB_SHA env variable is not set');
    }

    const {owner, repo} = context.repo;
    const github = new GitHub(actionInputs.ghToken);

    const currentCommit = (await github.repos.getCommit({owner, repo, ref: process.env.GITHUB_SHA})).data;
    if (isTriggeredByAction(currentCommit)) {
        ghActions.info('Commit was triggered by the action, skip to prevent a loop');
        return;
    }

    if (!fs.existsSync(actionInputs.templateYmlFile)) {
        throw new Error(`${actionInputs.templateYmlFile} file doesn't exist`);
    }

    const targetRef = actionInputs.addTag !== undefined
        ? actionInputs.addTag
        : process.env.GITHUB_SHA;
    const targetYmlFileName = getTargetYmlFileName(targetRef);
    const targetYmlFilePath = path.join(WORKFLOWS_DIR, targetYmlFileName);
    const targetYmlFileAbsPath = getWorkspacePath(targetYmlFilePath);

    const targetOwner = actionInputs.targetRepo ? actionInputs.targetRepo.owner : owner;
    const targetRepo = actionInputs.targetRepo ? actionInputs.targetRepo.repo : repo;

    ghActions.info(
        `GitHub: check if ${targetYmlFilePath} file already exists in ` +
        `${targetOwner}/${targetRepo}@${actionInputs.targetBranch}...`
    );
    const existingFileResponse = await octokitHandle404(
        github.repos.getContents, {
            owner: targetOwner,
            repo: targetRepo,
            path: targetYmlFilePath,
            ref: 'heads/' + actionInputs.targetBranch
        });
    const existingSha = existingFileResponse !== undefined
        ? (existingFileResponse.data as Octokit.ReposGetContentsResponseItem).sha
        : undefined;
    ghActions.info(existingSha ? `File found: ${existingSha}` : `File not found`);

    if (existingSha && !actionInputs.overrideTargetFile) {
        throw new Error(`${targetYmlFilePath} file already exists but overrideTargetFile is false!`);
    }

    ghActions.info(`Reading and modifying ${actionInputs.templateYmlFile}...`);
    let workflowContents = fs.readFileSync(actionInputs.templateYmlFile, 'utf8');
    workflowContents = modifyScheduledWorkflow(
        workflowContents,
        targetYmlFilePath,
        targetRef,
        actionInputs.addTag !== undefined,
        actionInputs.targetBranch
    );

    ghActions.info(
        `GitHub: Creating ${targetYmlFilePath} workflow file from the template in ` +
        `${targetOwner}/${targetRepo}@${actionInputs.targetBranch}...`
    );
    await github.repos.createOrUpdateFile({
        owner: targetOwner,
        repo: targetRepo,
        author: {
            email: consts.gitAuthorEmail,
            name: consts.gitAuthorName
        },
        branch: actionInputs.targetBranch,
        message: `Add delayed ${targetYmlFileName} job`,
        content: Buffer.from(workflowContents, 'binary').toString('base64'),
        path: targetYmlFilePath,
        sha: existingSha
    });

    if (actionInputs.addTag !== undefined) {
        ghActions.info(
            `GitHub: Checking if ${actionInputs.addTag} exists in ` +
            `${targetOwner}/${targetRepo}@${actionInputs.targetBranch}...`
        );
        const existingTag = await octokitHandle404(github.git.getRef, {
            owner: targetOwner,
            repo: targetRepo,
            ref: 'tags/' + actionInputs.addTag
        });
        if (existingTag !== undefined) {
            ghActions.info(`Tag found at commit ${existingTag.data.object.sha}`);
            ghActions.info(`GitHub: Updating ${actionInputs.addTag} to sha ${process.env.GITHUB_SHA}...`);
            await github.git.updateRef({
                owner: targetOwner,
                repo: targetRepo,
                ref: 'refs/tags/' + actionInputs.addTag,
                sha: process.env.GITHUB_SHA
            });
        } else {
            ghActions.info(`GitHub: Creating ${actionInputs.addTag} tag on sha ${process.env.GITHUB_SHA}...`);
            await github.git.createRef({
                owner: targetOwner,
                repo: targetRepo,
                ref: 'refs/tags/' + actionInputs.addTag,
                sha: process.env.GITHUB_SHA
            });
        }
    }

    actionOutputs.targetYmlFileName.setValue(targetYmlFileName);
    actionOutputs.targetYmlFilePath.setValue(targetYmlFileAbsPath);
}

function isTriggeredByAction(commit: Octokit.ReposGetCommitResponse): boolean {
    return (commit.commit.author.name === consts.gitAuthorName &&
        commit.commit.author.email === consts.gitAuthorEmail) ||
        commit.author.login === 'actions-user';
}

function getTargetYmlFileName(targetRef: string): string {
    if (actionInputs.targetYmlFileName !== undefined) {
        return actionInputs.targetYmlFileName;
    }
    const templateYmlFilePath = path.parse(actionInputs.templateYmlFile);
    if (templateYmlFilePath.ext !== '.yml') {
        ghActions.warning(`${actionInputs.templateYmlFile} file has not a .yml extension`);
    }
    return templateYmlFilePath.name + '-' + targetRef + '.yml';
}

// noinspection JSIgnoredPromiseFromCall
run();