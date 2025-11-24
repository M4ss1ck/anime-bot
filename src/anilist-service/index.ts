import axios from 'axios'

import type { SpecificCharacter, AnimePage, SpecificAnime, CharacterPage, NovelPage, SpecificNovel } from './types/index.js'

export const ANILIST_URL = 'https://graphql.anilist.co'

async function genericQuery(query: string, variables = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  const result = await axios.post(ANILIST_URL, {
    query,
    variables,
    headers,
  }, {
    timeout: 3000,
    signal: AbortSignal.timeout(3000),
  }).catch(err => console.log(err.message))

  return result?.data?.data ?? null
}

async function getAnimes(search: string, page = 1) {
  const query = `
            query ($page: Int, $perPage: Int, $search: String) {
                Page(page: $page, perPage: $perPage) {
                  pageInfo {
                      total
                      perPage
                  }
                  media(search: $search, type: ANIME, sort: FAVOURITES_DESC) {
                      id
                      title {
                      romaji
                      english
                      native
                      }
                      type
                      genres
                  }
                }
            }
   `

  const variables = {
    search,
    page,
    perPage: 5,
  }

  const animes: AnimePage = await genericQuery(query, variables)
  return animes
}

async function getNovels(search: string, page = 1) {
  const query = `
            query ($page: Int, $perPage: Int, $search: String) {
                Page(page: $page, perPage: $perPage) {
                  pageInfo {
                      total
                      perPage
                  }
                  media(search: $search, format: NOVEL, sort: FAVOURITES_DESC) {
                      id
                      title {
                        romaji
                        english
                        native
                      }
                      type
                      genres
                  }
                }
            }
   `

  const variables = {
    search,
    page,
    perPage: 5,
  }

  const novels: NovelPage = await genericQuery(query, variables)
  return novels
}

async function getAnime(id: number) {
  const query = `
        query ($id: Int) { # Define which variables will be used in the query (id)
            Media (id: $id, type: ANIME) { # Insert our variables into the query arguments (id) (type: ANIME is hard-coded in the query)
              id
              hashtag
              nextAiringEpisode {
                airingAt
                episode
              }
              title {
                  romaji
                  english
                  native
              }
              description (asHtml: false)
              seasonYear
              episodes
              coverImage {
                  extraLarge
                  large
                  medium
                  color
              }
            }
        }
    `
  const variables = {
    id,
  }

  const anime: SpecificAnime = await genericQuery(query, variables)
  return anime
}

async function getNovel(id: number) {
  const query = `
        query ($id: Int) { # Define which variables will be used in the query (id)
            Media (id: $id, format: NOVEL) {
              id
              title {
                  romaji
                  english
                  native
              }
              description
              coverImage {
                  medium
                  large
              }
              bannerImage
              status
              genres
              averageScore
              chapters
              volumes
              type
              format
              source
            }
        }
    `
  const variables = {
    id,
  }

  const novel: SpecificNovel = await genericQuery(query, variables)
  return novel
}

async function getCharacters(search: string, page = 1) {
  const query = `
    query ($page: Int, $perPage: Int, $search: String) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          perPage
        }
        characters(search: $search) {
          id
          name {
            first
            middle
            last
            full
            native
            userPreferred
          }
          image {
            large
            medium
          }
          description
          dateOfBirth {
            year
            month
            day
          }
          age
          gender
          bloodType
          siteUrl
        }
      }
    }
  `

  const variables = {
    search,
    page,
    perPage: 10,
  }

  const characters: CharacterPage = await genericQuery(query, variables)
  return characters
}

async function getIsBirthdayCharacters(page = 1) {
  const query = `
    query ($page: Int, $perPage: Int, $search: String) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          perPage
        }
        characters(isBirthday: true, search: $search) {
          id
          name {
            first
            middle
            last
            full
            native
            userPreferred
          }
          image {
            large
            medium
          }
          description
          dateOfBirth {
            year
            month
            day
          }
          age
          gender
          bloodType
          siteUrl
        }
      }
    }
  `

  const variables = {
    page,
    perPage: 10,
  }

  const bdChar: CharacterPage = await genericQuery(query, variables)
  return bdChar
}

async function getCharacter(id: number) {
  const query = `query ($id: Int){
    Character(id: $id) {
        id
        name {
          first
          middle
          last
          full
          native
          userPreferred
        }
        image {
          large
          medium
        }
        description
        dateOfBirth {
          year
          month
          day
        }
        age
        gender
        bloodType
        siteUrl
      }
    }`

  const variables = {
    id,
  }

  const character: SpecificCharacter = await genericQuery(query, variables)
  return character
}

async function getAnimeRelations(id: number) {
  const query = `
        query ($id: Int) {
            Media (id: $id, type: ANIME) {
              id
              relations {
                edges {
                  relationType
                  node {
                    id
                    type
                    title {
                      romaji
                      english
                      native
                    }
                    status
                    nextAiringEpisode {
                        airingAt
                        episode
                    }
                  }
                }
              }
            }
        }
    `
  const variables = {
    id,
  }

  const anime: SpecificAnime = await genericQuery(query, variables)
  return anime
}

export async function getNovelRelations(id: number) {
  const query = `
        query ($id: Int) {
            Media (id: $id, type: MANGA) {
              id
              relations {
                edges {
                  relationType
                  node {
                    id
                    type
                    title {
                      romaji
                      english
                      native
                    }
                    status
                  }
                }
              }
            }
        }
    `
  const variables = {
    id,
  }

  const novel: SpecificNovel = await genericQuery(query, variables)
  return novel
}

export { genericQuery, getAnime, getAnimes, getCharacter, getCharacters, getIsBirthdayCharacters, getNovels, getNovel, getAnimeRelations }
