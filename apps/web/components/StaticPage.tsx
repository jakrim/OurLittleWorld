import { pageContent, type PageContentKey } from "@/content/pageContent";

type StaticPageProps = {
  contentKey: PageContentKey;
};

export default function StaticPage({ contentKey }: StaticPageProps) {
  return (
    <main
      id="main"
      dangerouslySetInnerHTML={{ __html: pageContent[contentKey] }}
    />
  );
}
