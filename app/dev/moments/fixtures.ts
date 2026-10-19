import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import 'server-only';
import sharp from 'sharp';

/**
 * /dev/moments' fixture photos, read from dev/fixtures/moments/ (never
 * public/, never shipped: see the README there). Local development only; the
 * page checks devFeedAllowed() before calling anything here.
 */
import { FIXTURES, type Fixture, type FixturePhotos } from './fixtureNames';

export { FIXTURES, type Fixture, type FixturePhotos };

const dir = () => join(process.cwd(), 'dev', 'fixtures', 'moments');

export function fixtureFile(name: Fixture): Promise<Buffer> {
  return readFile(join(dir(), `${name}.jpg`));
}

/** Every fixture as an 800 px WebP data URL, for the client screens. */
export async function fixturePhotos(): Promise<FixturePhotos> {
  const urls = await Promise.all(
    FIXTURES.map(async (name) => {
      const webp = await sharp(await fixtureFile(name)).resize(800, 800, { fit: 'inside' }).webp({ quality: 72 }).toBuffer();
      return `data:image/webp;base64,${webp.toString('base64')}`;
    })
  );
  return Object.fromEntries(FIXTURES.map((n, i) => [n, urls[i]])) as FixturePhotos;
}
