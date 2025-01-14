import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
// import { AppInstallationParameters } from "../locations/ConfigScreen"

export interface SalesforceConfig {
  clientId: string;
  clientSecret: string;
  organizationId: string;
  shortCode: string;
  siteId: string;
  storefrontCatalogId?: string;
}

// console.log(import.meta.env.VITE_PROXY_URL)
const proxyUrl = import.meta.env.VITE_PROXY_URL || 'https://thawing-shore-22303.herokuapp.com/';

interface SFCCAdminToken {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface TokenProps {
  tokenInfo: SFCCAdminToken;
  expiry: Date;
}

export class SfccClient {
  protected client!: AxiosInstance;
  protected parameters: SalesforceConfig;
  protected accessToken: TokenProps | undefined;
  protected storefrontCatalogId: string | undefined;

  constructor(parameters: SalesforceConfig) {
    this.parameters = parameters;

    this.client = axios.create({
      baseURL: proxyUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(this.interceptor, (error) => Promise.reject(error));
  }

  private interceptor = (config: InternalAxiosRequestConfig) => {
    // Add basic proxy parameters to our URL
    config.url = `/sfcc/${this.parameters.shortCode}` + config.url;

    // Fetch access token and add to configuration
    return this.useAccessToken(config);
  };

  private fetchAccessToken = async () => {
    const authToken = window.btoa(`${this.parameters.clientId}:${this.parameters.clientSecret}`);
    const tenantId = this.parameters.organizationId.split('_').slice(2).join('_');
    const now = new Date();

    const { data } = await axios.post(
      'https://account.demandware.com/dwsso/oauth2/access_token',
      {
        grant_type: 'client_credentials',
        scope: `SALESFORCE_COMMERCE_API:${tenantId} sfcc.catalogs sfcc.products`,
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authToken}`,
        },
      }
    );

    return {
      tokenInfo: data,
      expiry: new Date(now.getTime() + data.expires_in * 1000),
    };
  };

  private useAccessToken = async (config: InternalAxiosRequestConfig) => {
    const now = new Date();

    const storageToken = localStorage.getItem('sfcc-token');

    let accessToken;
    if (!storageToken) {
      accessToken = await this.fetchAccessToken();
      localStorage.setItem('sfcc-token', JSON.stringify(accessToken));
    } else {
      accessToken = JSON.parse(storageToken) as TokenProps;
      const expiry = new Date(accessToken.expiry);

      if (now >= expiry) {
        accessToken = await this.fetchAccessToken();
        localStorage.setItem('sfcc-token', JSON.stringify(accessToken));
      }
    }

    config.headers.set('Authorization', `Bearer ${accessToken.tokenInfo.access_token}`);
    return config;
  };

  fetchProduct = async (productId: string) => {
    const { data: product } = await this.client.get(
      `/product/products/v1/organizations/${this.parameters.organizationId}/products/${productId}`,
      {
        params: { siteId: this.parameters.siteId },
      }
    );

    return product;
  };

  public fetchStorefrontCatalog = async () => {
    const { organizationId, siteId } = this.parameters;

    const postData: any = {
      query: {
        termQuery: {
          fields: ['is_storefront_catalog'],
          operator: 'is',
          values: [true],
        },
      },
    };

    const { data: catalogSearchResults } = await this.client.post(
      `/product/catalogs/v1/organizations/${organizationId}/catalog-search`,
      postData
    );

    const storefrontCatalogArray = catalogSearchResults.hits.filter((catalog: any) => {
      return catalog.assignedSites.some((site: any) => site.id === siteId);
    });

    return storefrontCatalogArray[0];
  };

  searchProducts = async (query?: string) => {
    if (!this.parameters.storefrontCatalogId) {
      throw new Error('No storefront catalog id set in client.');
    }

    const { organizationId, storefrontCatalogId } = this.parameters;

    const data: any = {
      query: {
        boolQuery: {
          must: [
            {
              termQuery: {
                fields: ['type'],
                operator: 'is',
                values: ['master'],
              },
            },
            {
              termQuery: {
                fields: ['catalogId'],
                operator: 'is',
                values: [storefrontCatalogId],
              },
            },
          ],
        },
      },
      sorts: [
        {
          field: 'name',
          sortOrder: 'asc',
        },
      ],
    };

    if (query?.length) {
      data.query.boolQuery.must.push({
        textQuery: {
          fields: ['id', 'name'],
          searchPhrase: query,
        },
      });
    }

    const { data: searchResults } = await this.client.post(
      `/product/products/v1/organizations/${organizationId}/product-search`,
      data,
      {
        params: { siteId: this.parameters.siteId },
      }
    );

    return searchResults.hits?.length ? searchResults.hits : [];
  };

  public searchCategories = async (query?: string) => {
    if (!this.parameters.storefrontCatalogId) {
      throw new Error('No storefront catalog id set in client.');
    }

    const { organizationId, storefrontCatalogId } = this.parameters;

    const data: any = {
      query: {
        boolQuery: {
          must: [
            {
              termQuery: {
                fields: ['online'],
                operator: 'is',
                values: [true],
              },
            },
          ],
        },
      },
      sorts: [
        {
          field: 'name',
          sortOrder: 'asc',
        },
      ],
    };

    if (query?.length) {
      data.query.boolQuery.must.push({
        textQuery: {
          fields: ['id', 'name'],
          searchPhrase: query,
        },
      });
    }

    const { data: searchResults } = await this.client.post(
      `/product/catalogs/v1/organizations/${organizationId}/catalogs/${storefrontCatalogId}/category-search`,
      data
    );

    return searchResults.hits?.length ? searchResults.hits : [];
  };

  public fetchCategory = async (categoryId: string) => {
    if (!this.parameters.storefrontCatalogId) {
      throw new Error('No storefront catalog id set in client.');
    }

    const { organizationId, storefrontCatalogId } = this.parameters;

    const { data: category } = await this.client.get(
      `/product/catalogs/v1/organizations/${organizationId}/catalogs/${storefrontCatalogId}/categories/${categoryId}`
    );

    return category;
  };

  private setStorefrontCatalogId = async () => {
    const storefrontCatalog = await this.fetchStorefrontCatalog();
    this.storefrontCatalogId = storefrontCatalog.id;
  };
}
