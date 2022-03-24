import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User, Verification } from './entities';
import { UsersService } from './users.service';
import { JwtService } from '../jwt/jwt.service';
import { MailService } from '../mail';

const mockRepository = () => ({
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
});

const mockJwtService = () => ({
  sign: jest.fn(() => 'signed-token'),
  verify: jest.fn(),
});

const mockMailService = () => ({
  sendVerificationEmail: jest.fn(),
});

type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe('UserService', () => {
  let usersRepository: MockRepository<User>;
  let verificationsRepository: MockRepository<Verification>;
  let service: UsersService;
  let mailService: MailService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository(),
        },
        {
          provide: getRepositoryToken(Verification),
          useValue: mockRepository(),
        },
        {
          provide: JwtService,
          useValue: mockJwtService(),
        },
        {
          provide: MailService,
          useValue: mockMailService(),
        },
      ],
    }).compile();

    usersRepository = module.get(getRepositoryToken(User));
    verificationsRepository = module.get(getRepositoryToken(Verification));
    service = module.get<UsersService>(UsersService);
    mailService = module.get<MailService>(MailService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  describe('findById', () => {
    const findByIdArgs = { id: 1 };

    it('should find existing user', async () => {
      usersRepository.findOneOrFail.mockResolvedValue(findByIdArgs);
      const result = await service.findById(1);

      expect(result).toEqual({ ok: true, user: findByIdArgs });
    });

    it('should fail if no user is found', async () => {
      usersRepository.findOneOrFail.mockRejectedValue(new Error());
      const result = await service.findById(1);

      expect(result).toEqual({ ok: false, error: 'User not found.' });
    });
  })

  describe('createAccount', () => {
    const createAccountArgs = {
      email: 'email',
      password: 'password',
      role: 0,
    };

    it('should fail if user exists', async () => {
      usersRepository.findOne.mockResolvedValue({ id: 1, email: 'email' });
      const result = await service.createAccount(createAccountArgs);

      expect(result).toMatchObject({
        ok: false,
        error: 'User is already exist.',
      });
    });

    it('should create new user', async () => {
      usersRepository.findOne.mockResolvedValue(undefined);
      usersRepository.create.mockReturnValue(createAccountArgs);
      usersRepository.save.mockResolvedValue(createAccountArgs);
      verificationsRepository.create.mockReturnValue({ user: createAccountArgs });
      verificationsRepository.save.mockResolvedValue({ code: 'code' });

      const result = await service.createAccount(createAccountArgs);

      expect(usersRepository.create).toHaveBeenCalledTimes(1);
      expect(usersRepository.create).toHaveBeenLastCalledWith(createAccountArgs);

      expect(usersRepository.save).toHaveBeenCalledTimes(1);
      expect(usersRepository.save).toHaveBeenLastCalledWith(createAccountArgs);

      expect(verificationsRepository.create).toHaveBeenCalledTimes(1);
      expect(verificationsRepository.create).toHaveBeenLastCalledWith({ user: createAccountArgs });

      expect(verificationsRepository.save).toHaveBeenCalledTimes(1);
      expect(verificationsRepository.save).toHaveBeenLastCalledWith({ user: createAccountArgs });

      expect(mailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mailService.sendVerificationEmail).toHaveBeenLastCalledWith(expect.any(String), expect.any(String));

      expect(result).toEqual({ ok: true })
    });

    it('should fail on exception', async () => {
      usersRepository.findOne.mockRejectedValue(new Error());
      const result = await service.createAccount(createAccountArgs);

      expect(result).toEqual({ ok: false, error: 'Can not create an account.'});
    });
  });

  describe('login', () => {
    const loginArgs = {
      email: 'email',
      password: 'password',
    };

    it('should fail if user does not exist', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      const result = await service.login(loginArgs);

      expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
      expect(usersRepository.findOne).toHaveBeenLastCalledWith(expect.any(Object), expect.any(Object));

      expect(result).toEqual({ ok: false, error: 'User does not exist.' })
    });

    it('should fail if password wrong', async () => {
      const mockedUser = { checkPassword: jest.fn(() => Promise.resolve(false)) };
      usersRepository.findOne.mockResolvedValue(mockedUser);
      const result = await service.login(loginArgs);

      expect(result).toEqual({ ok: false, error: 'Wrong credentials.' });
    });

    it('should return token if password correct', async () => {
      const mockedUser = { id: 1, checkPassword: jest.fn(() => Promise.resolve(true)) };
      usersRepository.findOne.mockResolvedValue(mockedUser);
      const result = await service.login(loginArgs);

      expect(jwtService.sign).toHaveBeenCalledTimes(1);
      expect(jwtService.sign).toHaveBeenLastCalledWith(expect.any(Number));

      expect(result).toEqual({ ok: true, token: 'signed-token' });
    });

    it('should fail on exception', async () => {
      usersRepository.findOne.mockRejectedValue(new Error());
      const result = await service.login(loginArgs);

      expect(result).toEqual({ ok: false, error: 'Can not log user in.' });
    });
  });

  describe('editProfile', () => {
    it('should change email', async () => {
      const oldUser = { email: 'email', verified: true };
      const { input, userId } = {
        userId: 1,
        input: { email: 'newEmail' },
      };
      const newVerification = { code: 'code' };
      const newUser = { verified: false, email: input.email };

      usersRepository.findOne.mockResolvedValue(oldUser);
      verificationsRepository.create.mockReturnValue(newVerification);
      verificationsRepository.save.mockResolvedValue(newVerification);

      await service.editProfile(userId, input);

      expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
      expect(usersRepository.findOne).toHaveBeenCalledWith(userId);

      expect(verificationsRepository.create).toHaveBeenCalledWith({ user: newUser });
      expect(verificationsRepository.save).toHaveBeenCalledWith(newVerification);

      expect(mailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(newUser.email, newVerification.code);
    });

    it('should change password', async () => {
      const { input, userId } = {
        userId: 1,
        input: { password: 'password' },
      };
      usersRepository.findOne.mockResolvedValue({ password: 'oldPassword' });
      const result = await service.editProfile(userId, input);

      expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
      expect(usersRepository.findOne).toHaveBeenCalledWith(userId);

      expect(usersRepository.save).toHaveBeenCalledTimes(1);
      expect(usersRepository.save).toHaveBeenCalledWith(input);

      expect(result).toEqual({ ok: true });
    })

    it('should fail on exception', async () => {
      const { input, userId } = {
        userId: 1,
        input: { password: 'password', email: 'email' },
      };
      usersRepository.findOne.mockRejectedValue(new Error());
      const result = await service.editProfile(userId, input);

      expect(result).toEqual({ ok: false, error: 'Could not update profile.' });
    })
  });

  describe('verifyEmail', () => {
    it('should verify email', async () => {
      const mockedVerification = {
        id: 1,
        user: { verified: false },
      }
      verificationsRepository.findOne.mockResolvedValue(mockedVerification);
      const result = await service.verifyEmail('code');

      expect(verificationsRepository.findOne).toHaveBeenCalledTimes(1);
      expect(verificationsRepository.findOne).toHaveBeenCalledWith(expect.any(Object), expect.any(Object));

      expect(usersRepository.save).toHaveBeenCalledTimes(1);
      expect(usersRepository.save).toHaveBeenCalledWith({ verified: true });

      expect(verificationsRepository.delete).toHaveBeenCalledTimes(1);
      expect(verificationsRepository.delete).toHaveBeenCalledWith(mockedVerification.id);

      expect(result).toEqual({ ok: true });
    });

    it('should fail on verification not found', async () => {
      verificationsRepository.findOne.mockResolvedValue(undefined);
      const result = await service.verifyEmail('code');

      expect(result).toEqual({ ok: false, error: 'Verification not found.'})
    });

    it('should fail on exception', async () => {
      verificationsRepository.findOne.mockRejectedValue(new Error());
      const result = await service.verifyEmail('code');

      expect(result).toEqual({ ok: false, error: 'Could not verify email.' });
    });
  });
});
