import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";

import { User } from './entities';
import { UsersService } from './users.service';
import {
  CreateAccountInput, CreateAccountOutput,
  EditProfileInput, EditProfileOutput,
  LoginInput, LoginOutput,
  UserProfileInput, UserProfileOutput,
  VerifyEmailInput, VerifyEmailOutput
} from "./dtos";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth-user.decorator";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User)
  @UseGuards(AuthGuard)
  me(@AuthUser() authUser: User) {
    return authUser;
  }

  @Query(() => UserProfileOutput)
  @UseGuards(AuthGuard)
  userProfile(@Args() { userId }: UserProfileInput): Promise<UserProfileOutput> {
    return this.usersService.findById(userId);
  }

  @Mutation(() => CreateAccountOutput)
  createAccount(@Args("input") createAccountInput: CreateAccountInput): Promise<CreateAccountOutput> {
    return this.usersService.createAccount(createAccountInput);
  }

  @Mutation(() => LoginOutput)
  login(@Args('input') loginInput: LoginInput): Promise<LoginOutput> {
    return this.usersService.login(loginInput);
  }

  @Mutation(() => EditProfileOutput)
  @UseGuards(AuthGuard)
  editProfile(@AuthUser() { id }: User, @Args('input') editProfileInput: EditProfileInput): Promise<EditProfileOutput> {
    return this.usersService.editProfile(id, editProfileInput);
  }

  @Mutation(() => VerifyEmailOutput)
  verifyEmail(@Args('input') { code }: VerifyEmailInput): Promise<VerifyEmailOutput> {
    return this.usersService.verifyEmail(code);
  }
}
