import 'server-only';
import { getLang } from '../auth';
import { makeT } from './index';

export async function getT() {
  const lang = await getLang();
  return { t: makeT(lang), lang };
}
