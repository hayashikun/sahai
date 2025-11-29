import { atom } from "jotai";

// Selected project ID
export const selectedProjectIdAtom = atom<string | null>(null);

// Selected repository ID
export const selectedRepositoryIdAtom = atom<string | null>(null);
