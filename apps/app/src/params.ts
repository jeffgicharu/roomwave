import { defineParams } from "@sveltejs/kit/params";

export const params = defineParams({
  /** A six-digit join code, the audience's short address: /482913 */
  joincode: (param: string) => (/^[1-9][0-9]{5}$/.test(param) ? param : undefined),
});
