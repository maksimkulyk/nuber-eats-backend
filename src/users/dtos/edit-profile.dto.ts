import { CoreOutput } from '../../common/dtos/output.dto';
import { InputType, ObjectType, PartialType, PickType } from "@nestjs/graphql";
import { User } from "../entities";

@ObjectType()
export class EditProfileOutput extends CoreOutput {}

@InputType()
export class EditProfileInput extends PartialType(PickType(User, ['email', 'password'])) {}