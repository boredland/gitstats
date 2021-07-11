import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { useQuery } from "react-query";
import { useState } from "react";

export default function Home() {
  const [org, setOrg] = useState<string>();
  const [repo, setRepo] = useState<string>();

  const getCount = () => fetch(`/api/${org}/${repo}`).then((res) => res.json());

  const { data, isLoading } = useQuery(["projects", org, repo], getCount, {
    enabled: !!org && !!repo,
  });

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
                target: { org: { value: string }; repo: { value: string } };
              }
            ) => {
              setOrg(event.target.org.value);
              setRepo(event.target.repo.value);
              event.preventDefault();
            }}
          >
            <label htmlFor="org">github organization: </label>
            <input id="org" type="text" required />
            <br />
            <label htmlFor="repo">github repo: </label>
            <input id="repo" type="text" required />
            <br />
            <button type="submit">generate</button>
          </form>
        </div>
        <div className={styles.grid}>
          {isLoading && "...loading..."}
          {!isLoading && JSON.stringify(data)}
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
