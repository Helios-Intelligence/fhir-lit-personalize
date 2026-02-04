declare module 'pdf-parse' {
  interface PDFInfo {
    Title?: string;
    Author?: string;
    Subject?: string;
    Keywords?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: string;
    ModDate?: string;
  }

  interface PDFData {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata: any;
    version: string;
    text: string;
  }

  interface PDFParseOptions {
    max?: number;
    version?: string;
  }

  function pdfParse(
    buffer: Buffer,
    options?: PDFParseOptions
  ): Promise<PDFData>;

  export default pdfParse;
}
