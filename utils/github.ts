import { Octokit } from "@octokit/rest";

if (!process.env.GITHUB_PAT) throw new Error("GITHUB_PAT not set");

declare global {
    var __octokit__: Octokit;
}

if (!global.__octokit__) {
    global.__octokit__ = new Octokit({ auth: process.env.GITHUB_PAT });
}

export default global.__octokit__;