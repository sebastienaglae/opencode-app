import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="oc-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Fenced code is wrapped in <pre><code>; render it with Shiki.
          pre: (props: any) => {
            const child = (Array.isArray(props.children) ? props.children[0] : props.children) as
              | { props?: { className?: string; children?: unknown } }
              | undefined;
            const className: string = child?.props?.className ?? "";
            const raw = String(child?.props?.children ?? "").replace(/\n$/, "");
            const lang = /language-([\w-]+)/.exec(className)?.[1];
            return <CodeBlock code={raw} lang={lang} />;
          },
          code: (props: any) => <code className={props.className}>{props.children}</code>,
          a: (props: any) => (
            <a href={props.href} target="_blank" rel="noreferrer noopener">
              {props.children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
