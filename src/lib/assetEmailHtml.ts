import { marked } from 'marked';

interface Options {
  title: string;
  assetType: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function markdownToEmailHtml(markdown: string, { title, assetType }: Options): string {
  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(markdown || '', { async: false }) as string;
  const safeTitle = escapeHtml(title);
  const safeType = escapeHtml(assetType.replace(/_/g, ' '));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeTitle}</title>
<style>
  body { margin: 0; padding: 0; background: #F8F8FC; font-family: 'Poppins', Arial, Helvetica, sans-serif; color: #1a1a2e; line-height: 1.6; }
  .wrapper { max-width: 640px; margin: 0 auto; background: #ffffff; }
  .header { background: #0f284c; padding: 20px 32px; }
  .header-brand { color: #ffffff; font-size: 18px; font-weight: 600; letter-spacing: 0.3px; }
  .header-tag { color: #b8c6dc; font-size: 12px; margin-top: 4px; }
  .meta { padding: 20px 32px 0; }
  .chip { display: inline-block; background: #f0e7ff; color: #8833ff; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; padding: 4px 10px; border-radius: 999px; }
  .title { padding: 12px 32px 4px; font-size: 24px; font-weight: 700; color: #0f284c; line-height: 1.25; margin: 0; }
  .content { padding: 16px 32px 32px; font-size: 15px; }
  .content h1, .content h2, .content h3 { color: #0f284c; font-weight: 600; line-height: 1.3; margin: 1.4em 0 0.5em; }
  .content h1 { font-size: 22px; }
  .content h2 { font-size: 19px; color: #e33e23; }
  .content h3 { font-size: 16px; }
  .content p { margin: 0 0 1em; }
  .content a { color: #8833ff; text-decoration: underline; }
  .content ul, .content ol { padding-left: 1.4em; margin: 0 0 1em; }
  .content li { margin: 0.25em 0; }
  .content blockquote { border-left: 3px solid #8833ff; padding: 4px 14px; color: #475569; margin: 1em 0; background: #faf7ff; }
  .content code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'SF Mono', Menlo, monospace; }
  .content pre { background: #0f284c; color: #f8fafc; padding: 14px; border-radius: 6px; overflow-x: auto; }
  .content pre code { background: transparent; color: inherit; padding: 0; }
  .content hr { border: 0; border-top: 1px solid #e2e8f0; margin: 2em 0; }
  .footer { padding: 20px 32px 32px; border-top: 1px solid #eef0f5; font-size: 12px; color: #64748b; }
  .footer-brand { color: #0f284c; font-weight: 600; }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-brand">Signal + Scale</div>
      <div class="header-tag">GTM content delivery</div>
    </div>
    <div class="meta"><span class="chip">${safeType}</span></div>
    <h1 class="title">${safeTitle}</h1>
    <div class="content">${bodyHtml}</div>
    <div class="footer">
      Sent from <span class="footer-brand">Signal + Scale</span>. This is a content preview from your GTM workspace.
    </div>
  </div>
</body>
</html>`;
}
