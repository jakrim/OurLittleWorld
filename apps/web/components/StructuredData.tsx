import {
  breadcrumbStructuredData,
  organizationStructuredData,
  type SiteRouteId,
  websiteStructuredData,
} from "@/lib/siteSeo";

type StructuredDataProps = {
  data: object;
  id: string;
};

export function SiteStructuredData() {
  return (
    <>
      <StructuredData id="organization-structured-data" data={organizationStructuredData()} />
      <StructuredData id="website-structured-data" data={websiteStructuredData()} />
    </>
  );
}

export function BreadcrumbStructuredData({ route }: { route: SiteRouteId }) {
  const data = breadcrumbStructuredData(route);
  return data ? <StructuredData id={`breadcrumb-structured-data-${route}`} data={data} /> : null;
}

function StructuredData({ data, id }: StructuredDataProps) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
