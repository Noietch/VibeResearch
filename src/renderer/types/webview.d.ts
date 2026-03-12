declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        plugins?: string;
        nodeintegration?: string;
        disablewebsecurity?: string;
        partition?: string;
        webpreferences?: string;
      },
      HTMLElement
    >;
  }
}
