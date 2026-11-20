/// <reference types="vite/client" />

declare module 'virtual:alimaama-project-files' {
  export interface ProjectArchivePayload {
    generatedAt: string;
    textFiles: Record<string, string>;
    binaryAssetUrls: Array<{
      archivePath: string;
      fetchUrl: string;
    }>;
  }
  const payload: ProjectArchivePayload;
  export default payload;
}
