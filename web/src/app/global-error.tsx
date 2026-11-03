'use client';

// Root-layout render errors bypass every other boundary; show the bare minimum.
export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <h1>Something went wrong</h1>
        <p>Please try again in a moment.</p>
      </body>
    </html>
  );
}
