/** Rewritten text a Hinglish reader sees is Hindi in Latin script: tell screen readers. */
export const langFor = (language: "en" | "hinglish" | undefined, rewritten: boolean) => (language === "hinglish" && rewritten ? "hi-Latn" : undefined);
