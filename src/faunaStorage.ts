import faunadb from "faunadb";

export const getFauna = (): faunadb.Client => {
  if (!process.env.FAUNA_SECRET) {
    throw new Error(
      "Neither an instance of faunaClient, nor the FAUNA_SECRET provided!"
    );
  }

  if (!(global as any).__faunaClient__) {
    (global as any).__faunaClient__ = new faunadb.Client({
      secret: process.env.FAUNA_SECRET,
    });
  }
  return (global as any).__faunaClient__;
};
