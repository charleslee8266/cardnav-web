/// <reference types="astro/client" />

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module 'gray-matter' {
  export default function matter(input: string): {
    data: Record<string, unknown>;
    content: string;
  };
}
