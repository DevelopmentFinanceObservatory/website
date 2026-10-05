// A graph door's url field can hold any text. Link it only when it starts with http: or https:.
export const httpOnly = (value: string | null | undefined): string | undefined =>
    value && /^https?:/.test(value) ? value : undefined;
