import CommercialAvailability from "@/components/CommercialAvailability";
import { type PageContentKey } from "@/content/pageContent";
import { publicPageContent } from "@/content/publicPageContent";
import { publicCommercialConfig } from "@/lib/commercialConfig";

type StaticPageProps = {
  contentKey: PageContentKey;
};

export default function StaticPage({ contentKey }: StaticPageProps) {
  const content = publicPageContent(contentKey, publicCommercialConfig);

  return (
    <main id="main">
      <div dangerouslySetInnerHTML={{ __html: content }} />
      {contentKey === "home" || contentKey === "pricing" || contentKey === "gift" || contentKey === "story" ? (
        <CommercialAvailability surface={contentKey} />
      ) : null}
    </main>
  );
}
