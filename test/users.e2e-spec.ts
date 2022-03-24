import { getConnection, Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';

import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { User, Verification } from "../src/users/entities";

const GRAPHQL_ENDPOINT = '/graphql';
const EMAIL = 'test@test.com';
const NEW_EMAIL = 'test1@test.com';
const PASSWORD = '12345';

jest.mock('got', () => ({ post: jest.fn() }));

describe('UserModule (e2e)', () => {
  let usersRepository: Repository<User>;
  let verificationsRepository: Repository<Verification>;
  let app: INestApplication;
  let jwtToken: string;

  const baseTest = () => request(app.getHttpServer()).post(GRAPHQL_ENDPOINT);
  const publicTest = (query: string) => baseTest().send({ query });
  const privateTest = (query: string) => baseTest().set('X-JWT', jwtToken).send({ query });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    usersRepository = module.get<Repository<User>>(getRepositoryToken(User));
    verificationsRepository = module.get<Repository<Verification>>(getRepositoryToken(Verification));
    app = module.createNestApplication();

    await app.init();
  });

  afterAll(async () => {
    await getConnection().dropDatabase();
    await app.close();
  });

  describe('createAccount', () => {
    it('should create an account', () => {
      return publicTest(`
        mutation {
          createAccount(input: {
            email: "${EMAIL}",
            password: "${PASSWORD}",
            role: Owner
          }) {
            ok
            error
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { createAccount} } } = res;
          expect(createAccount).toEqual({ ok: true, error: null });
        });
    });

    it('should fail if account exists', () => {
      return publicTest(`
        mutation {
          createAccount(input: {
            email: "${EMAIL}",
            password: "${PASSWORD}",
            role: Owner
          }) {
            ok
            error
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { createAccount} } } = res;
          expect(createAccount).toEqual({ ok: false, error: "User is already exist." });
        });
    })
  });

  describe('login', () => {
    it('should login with correct credentials', () => {
      return publicTest(`
        mutation {
          login(input: {
            email: "${EMAIL}",
            password: "${PASSWORD}",
          }){
            ok
            error
            token
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { login } } } = res;
          expect(login).toEqual({ ok: true, error: null, token: expect.any(String) });
          jwtToken = login.token;
        });
    });

    it('should not be able to login with wrong credentials', () => {
      return publicTest(`
        mutation {
          login(input: {
            email: "${EMAIL}",
            password: "qwerty",
          }){
            ok
            error
            token
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { login } } } = res;
          expect(login).toEqual({ ok: false, error: 'Wrong credentials.', token: null });
        });
    });
  });

  describe('userProfile', () => {
    let userId: number;

    beforeAll(async () => {
      const [{ id }] = await usersRepository.find();
      userId = id;
    });

    it('should see a user\'s profile', () => {
      return privateTest(`
        {
          userProfile(userId: ${userId}) {
            ok
            error
            user { id }
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { userProfile } } } = res;
          expect(userProfile).toEqual({ ok: true, error: null, user: { id: userId } })
        })
    });

    it('should not find a profile', () => {
      return privateTest(`
        {
          userProfile(userId: 42) {
            ok
            error
            user { id }
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { userProfile } } } = res;
          expect(userProfile).toEqual({ ok: false, error: 'User not found.', user: null })
        })
    });
  });

  describe('me', () => {
    it('should find my profile', () => {
      return privateTest(`{ me { email } }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { me } } } = res;
          expect(me).toEqual({ email: EMAIL });
        });
    });

    it('should not allow logged out users', () => {
      return publicTest(`{ me { email } }`)
        .expect(200)
        .expect((res) => {
          const { body: { errors: [error] } } = res;
          expect(error.message).toEqual('Forbidden resource');
        });
    })
  });

  describe('verifyEmail', () => {
    it('should change email', () => {
      return privateTest(`
        mutation {
          editProfile(input: {
            email: "${NEW_EMAIL}"
          }) {
            ok
            error
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { editProfile } } } = res;
          expect(editProfile).toEqual({ ok: true, error: null } );
        });
    });

    it('should have new email', () => {
      return privateTest(`{ me { email } }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { me } } } = res;
          expect(me).toEqual({ email: NEW_EMAIL });
        });
    })
  });

  describe('editProfile', () => {
    let verificationCode: string;

    beforeAll(async () => {
      const [{ code }] = await verificationsRepository.find();
      verificationCode = code;
    });

    it('should fail on verification code not found', () => {
      return publicTest(`
        mutation {
          verifyEmail(input: {
            code: "wrong code"
          }) {
            ok
            error
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { verifyEmail } } } = res;
          expect(verifyEmail).toEqual({ ok: false, error: 'Verification not found.'});
        });
    })

    it('should verify email', () => {
      return publicTest(`
        mutation {
          verifyEmail(input: {
            code: "${verificationCode}"
          }) {
            ok
            error
          }
        }`)
        .expect(200)
        .expect((res) => {
          const { body: { data: { verifyEmail } } } = res;
          expect(verifyEmail).toEqual({ ok: true, error: null });
        });
    })
  });
});
