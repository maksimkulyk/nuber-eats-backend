import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { JwtService } from "../jwt/jwt.service";

import { User, Verification } from "./entities";
import {
  VerifyEmailOutput, UserProfileOutput,
  EditProfileInput, EditProfileOutput,
  LoginInput, LoginOutput,
  CreateAccountInput, CreateAccountOutput,
} from "./dtos";
import { MailService } from "../mail";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Verification) private readonly verifications: Repository<Verification>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async findById(id: number): Promise<UserProfileOutput> {
    try {
      const user = await this.users.findOneOrFail({ id });

      return { ok: true, user };
    } catch (error) {
      return { ok: false, error: 'User not found.' };
    }
  }

  async createAccount({ email, password, role }: CreateAccountInput): Promise<CreateAccountOutput> {
    try {
      const existingUser = await this.users.findOne({ email });

      if (existingUser) {
        return { ok: false, error: "User is already exist." };
      }

      const user = await this.users.save(this.users.create({ email, password, role }));
      const { code } = await this.verifications.save(this.verifications.create({ user }));
      await this.mailService.sendVerificationEmail(email, code);

      return { ok: true };
    } catch (error) {
      return { ok: false, error: 'Can not create an account.'};
    }
  }

  async login({ email, password }: LoginInput): Promise<LoginOutput> {
    try {
      const user = await this.users.findOne({email}, { select: ['id', 'password']});
      if (!user) {
        return { ok: false, error: 'User does not exist.' };
      }

      const isPasswordCorrect = await user.checkPassword(password);
      if (!isPasswordCorrect) {
        return { ok: false, error: 'Wrong credentials.' };
      }

      const token = this.jwtService.sign(user.id);

      return { ok: true, token};
    } catch (error) {
      return { ok: false, error: 'Can not log user in.'};
    }
  }

  async editProfile(userId: number, { email, password }: EditProfileInput): Promise<EditProfileOutput> {
    try {
      const user = await this.users.findOne(userId);
      if (email) {
        user.email = email;
        user.verified = false;
        await this.verifications.delete({ user: { id: user.id}});
        const { code } = await this.verifications.save(this.verifications.create({ user }));
        await this.mailService.sendVerificationEmail(email, code);
      }

      if (password) {
        user.password = password;
      }

      await this.users.save(user);

      return { ok: true };
    } catch (error) {
      return { ok: false, error: 'Could not update profile.' };
    }
  }

  async verifyEmail(code: string): Promise<VerifyEmailOutput> {
    try {
      const verification = await this.verifications.findOne({ code }, { relations: ['user'] });
      if (verification) {
        verification.user.verified = true;
        await this.users.save(verification.user);
        await this.verifications.delete(verification.id);

        return { ok: true };
      }

      return { ok: false, error: 'Verification not found.'};
    } catch (error) {
      return { ok: false, error: 'Could not verify email.'};
    }
  }
}
