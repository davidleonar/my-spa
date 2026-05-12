import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="apple-touch-icon.png" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/apple-touch-icon.png" />
        {/* Add more if needed: <link rel="apple-touch-icon" href="/apple-touch-icon.png" /> */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}