/**
 * Splits text into chunks of specified maximum size with overlap.
 * 
 * @param text The input text to split.
 * @param chunkSize Maximum size of each chunk in characters.
 * @param overlap Number of characters to overlap between adjacent chunks.
 * @returns Array of text chunks.
 */
export function splitIntoChunks(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50
): string[] {
  if (text.length <= chunkSize) {
    return [text.trim()];
  }

  // Split by sentence punctuation followed by space, or newlines
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    // If a single sentence is larger than chunkSize, we split it into smaller overlapping pieces
    if (sentence.length > chunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      let temp = sentence;
      while (temp.length > 0) {
        const subChunk = temp.slice(0, chunkSize);
        chunks.push(subChunk.trim());
        temp = temp.slice(chunkSize - overlap);
        if (temp.length <= overlap) break;
      }
      continue;
    }

    const spacer = currentChunk ? ' ' : '';
    if ((currentChunk + spacer + sentence).length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      // Get overlap from the end of the previous chunk
      if (overlap > 0 && currentChunk.length > overlap) {
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += spacer + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
