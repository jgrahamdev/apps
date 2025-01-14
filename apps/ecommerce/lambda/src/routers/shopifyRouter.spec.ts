import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import app from '../app';
import * as NodeAppsToolkit from '@contentful/node-apps-toolkit';
import { mockResourceLink } from '../mocks/resourceLink.mock';
import Sinon from 'sinon';
import Client, {
  CheckoutResource,
  CollectionResource,
  ImageResource,
  Product,
  ProductResource,
  Shop,
  ShopResource,
} from 'shopify-buy';

const sandbox = Sinon.createSandbox();
chai.use(chaiHttp);
chai.should();

const shopifyClientStub = {
  product: {
    fetch: () =>
      Sinon.promise((resolve) => {
        return resolve({
          title: 'Some Product title',
          description: 'Some product description',
          images: [{ url: 'some-product-url' }],
        } as Product);
      }),
    fetchAll: () =>
      Sinon.promise((resolve) => {
        return resolve([
          {
            title: 'Some Product title',
            description: 'Some product description',
            images: [{ url: 'some-product-url' }],
          },
          {
            title: 'Some Product title 2',
            description: 'Some product description 2',
            images: [{ url: 'some-product-url2' }],
          },
        ] as Product[]);
      }),
    fetchMultiple: () => Sinon.promise(Sinon.spy()),
    fetchByHandle: () => Sinon.promise(Sinon.spy()),
    fetchQuery: () => Sinon.promise(Sinon.spy()),
    fetchRecommendations: () => Sinon.promise(Sinon.spy()),
    graphQLClient: null,
  } as ProductResource,
  collection: {} as CollectionResource,
  checkout: {} as CheckoutResource,
  image: {} as ImageResource,
  shop: {
    fetchInfo: () => {
      return Sinon.promise((resolve) => {
        return resolve({
          id: 'some-shop-id',
          name: 'some test shop name',
        } as Shop);
      });
    },
    fetchPolicies: () => Sinon.promise(Sinon.spy()),
    graphQLClient: null,
  } as ShopResource,
  graphQLClient: null,
  fetchNextPage: function <T extends Client.Node>(): Promise<T[]> {
    throw new Error('Function not implemented.');
  },
};

const shopName = 'mytest-shop';
const storefrontAccessToken = 'some-access-token';

describe('Shopify Router', () => {
  beforeEach((done) => {
    sandbox.stub(NodeAppsToolkit, 'verifyRequest').get(() => {
      return () => true;
    });
    done();
  });

  afterEach((done) => {
    sandbox.restore();
    done();
  });

  describe('When checking credentials', () => {
    it('should reply with store data', (done) => {
      sandbox.stub(Client, 'buildClient').returns(shopifyClientStub);
      chai
        .request(app)
        .get('/shopify/credentials')
        .set('x-contentful-app', 'appId123')
        .set('x-contentful-space-id', 'spaceId123')
        .set('x-contentful-environment-id', 'environmentId123')
        .set('x-data-provider-parameters', JSON.stringify({ shopName, storefrontAccessToken }))
        .end((error, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('id');
          expect(res.body).to.have.property('name');
          done();
        });
    });
  });

  describe('When requesting list of resources', () => {
    it('should reply with Shopify resources', (done) => {
      sandbox.stub(Client, 'buildClient').returns(shopifyClientStub);
      chai
        .request(app)
        .post('/shopify/resources')
        .set('x-contentful-app', 'appId123')
        .set('x-contentful-space-id', 'spaceId123')
        .set('x-contentful-environment-id', 'environmentId123')
        .set('x-data-provider-parameters', JSON.stringify({ shopName, storefrontAccessToken }))
        .end((error, res) => {
          expect(res).to.have.status(200);
          expect(res.body.length).equals(2);
          done();
        });
    });
  });

  describe('When requesting a resource', () => {
    it('should reply with Shopify resource when id is valid', (done) => {
      sandbox.stub(Client, 'buildClient').returns(shopifyClientStub);
      chai
        .request(app)
        .post('/shopify/resource')
        .set('x-contentful-app', 'appId123')
        .set('x-contentful-space-id', 'spaceId123')
        .set('x-contentful-environment-id', 'environmentId123')
        .set('x-data-provider-parameters', JSON.stringify({ shopName, storefrontAccessToken }))
        .send({ sys: mockResourceLink.sys })
        .end((error, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.have.property('name');
          expect(res.body).to.have.property('description');
          done();
        });
    });

    it('shows an error message when id is invalid', (done) => {
      sandbox.stub(Client, 'buildClient').returns({
        ...shopifyClientStub,
        product: {
          fetch: () =>
            Sinon.promise((resolve) => {
              return resolve(null);
            }),
        } as unknown as ProductResource,
      });
      chai
        .request(app)
        .post('/shopify/resource')
        .set('x-contentful-app', 'appId123')
        .set('x-contentful-space-id', 'spaceId123')
        .set('x-contentful-environment-id', 'environmentId123')
        .set('x-data-provider-parameters', JSON.stringify({ shopName, storefrontAccessToken }))
        .send({ sys: mockResourceLink.sys })
        .end((error, res) => {
          expect(res).to.have.status(404);
          expect(res.body.message).to.match(/Product Not Found/);
          done();
        });
    });
  });
});
