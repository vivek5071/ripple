import { getOctokit } from '@actions/github'

type Octokit = ReturnType<typeof getOctokit>

export async function emailToHandle(
  email: string,
  octokit: Octokit
): Promise<string | undefined> {
  try {
    const { data } = await octokit.rest.search.users({
      q: `${email} in:email`,
      per_page: 1,
    })
    return data.items[0]?.login
  } catch {
    return undefined
  }
}
