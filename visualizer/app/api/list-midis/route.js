import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const rootDir = path.resolve(process.cwd(), '..');
    
    const [rootFiles, midisFiles] = await Promise.all([
      fs.readdir(rootDir, { withFileTypes: true }).catch(() => []),
      fs.readdir(path.join(rootDir, 'midis'), { withFileTypes: true }).catch(() => [])
    ]);

    const allMidis = [];
    
    const rootDict = {
      'pathetique_2_test.mid': 'chunk1',
      'pathetique_test_chunk2.mid': 'chunk2',
      'pathetique_test_chunk3.mid': 'chunk3',
    };
    
    // Default hardcoded just in case
    allMidis.push({ label: 'Chunk 1 (Mm. 1-4)', value: 'chunk1' });
    allMidis.push({ label: 'Chunk 2 (Mm. 5-8)', value: 'chunk2' });
    allMidis.push({ label: 'Chunk 3 (Mm. 9-12)', value: 'chunk3' });

    // Map uploads
    for (const f of midisFiles) {
      if (f.isFile() && f.name.endsWith('.mid')) {
        const p = 'midis/' + f.name;
        allMidis.push({ label: `Uploaded: ${f.name}`, value: p });
      }
    }

    return NextResponse.json({ midis: allMidis });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
