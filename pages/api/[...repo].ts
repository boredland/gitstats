// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "@octokit/rest";

type Data = {
  count?: number;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

  const ownerRepoInput = req.query.repo;

  const repoConf = {
    owner: ownerRepoInput[0],
    repo: ownerRepoInput[1],
  };

  if (!repoConf.owner || !repoConf.repo) {
    return res
      .status(400)
      .json({ error: "repos have to be in OWNER/REPO syntax" });
  }

  const repoInfo = await octokit.repos.get(repoConf).catch((error) => {
    res.status(400).json({ error: error.response.data.message });
    return null;
  });
  if (!repoInfo) return;

  let releaseIds: number[] = [];
  let page = 0;
  let fetchNext = true;

  do {
    const newReleaseIds = (
      await octokit.repos.listReleases({ ...repoConf, per_page: 100, page })
    ).data.map((release) => release.id);
    if (!newReleaseIds.length) {
      break;
    }
    releaseIds = [...releaseIds, ...newReleaseIds];
    page++;
  } while (true);

  console.log(releaseIds);

  const downloadsByRelease = await Promise.all(
    releaseIds.map(async (release_id) => {
      const assets = await octokit.repos.listReleaseAssets({
        ...repoConf,
        release_id,
      });
      const downloadCounts = assets.data.map((asset) => asset.download_count);
      return Math.max(...downloadCounts);
    })
  );

  console.log(downloadsByRelease);

  const totalDownloads = downloadsByRelease
    .filter((value) => value !== -Infinity)
    .reduce((pv, cv) => pv + cv, 0);

  res
    .status(200)
    .setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate")
    .json({ count: totalDownloads });
}
