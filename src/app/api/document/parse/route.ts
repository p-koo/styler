import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        // Dynamic import for pdf-parse
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);

        if (!data.text || data.text.trim().length === 0) {
          return NextResponse.json(
            { error: 'PDF appears to be empty or contains only images. Please use a text-based PDF.' },
            { status: 400 }
          );
        }

        return NextResponse.json({
          text: data.text,
          pages: data.numpages,
          filename: file.name,
        });
      } catch (pdfError) {
        console.error('PDF parse error:', pdfError);
        return NextResponse.json(
          { error: `Failed to parse PDF: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}` },
          { status: 500 }
        );
      }
    } else {
      // Plain text
      const text = buffer.toString('utf-8');

      return NextResponse.json({
        text,
        filename: file.name,
      });
    }
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse file' },
      { status: 500 }
    );
  }
}
