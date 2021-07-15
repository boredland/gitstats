import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { useQuery } from "react-query";
import { useEffect, useState } from "react";

export default function Home() {
  const [org, setOrg] = useState<string>();
  const [repo, setRepo] = useState<string>();
  const [suffix, setSuffix] = useState<string>();
  const [badgeUrl, setBadgeUrl] = useState<string>();

  const getCount = () => fetch(`/api/${org}/${repo}${!!suffix ? `?suffix=${suffix}` : ""}`).then((res) => res.json());

  const { data, isLoading } = useQuery(["projects", org, repo], getCount, {
    enabled: !!org && !!repo,
    retry: false,
    cacheTime: 10 * 60 * 1000
  });

  useEffect(() => {
    if (!data || isLoading) return;
    const queryUrl = encodeURIComponent(
      `${window.location.href}api/${org}/${repo}${!!suffix ? `?suffix=${suffix}` : ""}`
    );
    const color = encodeURIComponent("green");
    const label = encodeURIComponent("downloads");
    const cacheMinutes = 60;

    setBadgeUrl(
      `https://img.shields.io/badge/dynamic/json?color=${color}&label=${label}&cache=${
        cacheMinutes * 60
      }&query=count&url=${queryUrl}`
    );
  }, [org, repo, suffix, data, isLoading]);

  return (
    <div className={styles.container}>
      <Head>
        <title>github release download count</title>
        <meta
          name="description"
          content="sums up all download counts for you release assets"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.grid}>
          <form
            onSubmit={(
              event: React.FormEvent<HTMLFormElement> & {
                target: {
                  org: { value: string };
                  repo: { value: string };
                  suffix: { value: string };
                };
              }
            ) => {
              setOrg(event.target.org.value);
              setRepo(event.target.repo.value);
              setSuffix(event.target.suffix.value);
              event.preventDefault();
            }}
          >
            <label htmlFor="org">github organization: </label>
            <input id="org" type="text" required />
            <br />
            <label htmlFor="repo">github repo: </label>
            <input id="repo" type="text" required />
            <br />
            <label htmlFor="suffix">suffix of the files to count (defaults to the file with the highest count): </label>
            <input id="suffix" type="text" />
            <br />
            <button type="submit">generate</button>
          </form>
        </div>
        <div className={styles.grid}>
          {isLoading && "...loading..."}
          {!isLoading && JSON.stringify(data)}
        </div>
        <div className={styles.grid}>
          {!!badgeUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={badgeUrl} alt="badge" />
          )}
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{" "}
          <span className={styles.logo}>
            <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
          </span>
        </a>
      </footer>
    </div>
  );
}
