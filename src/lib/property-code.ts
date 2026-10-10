/**
 * Property codes ("P-TNRP4H") are what sellers and buyers say on the phone, so
 * seller URLs use them too: /seller/properties/p-tnrp4h/edit.
 */
export function propertyCodeFromParam(param: string): string | null {
  const code = param.trim().toUpperCase();
  return /^P-[A-Z0-9]{4,8}$/.test(code) ? code : null;
}

export const editPropertyPath = (code: string) => `/seller/properties/${code.toLowerCase()}/edit`;
