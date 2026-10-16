import {
  getCreateEmployeeAccountDefinition,
} from "./createEmployeeAccount.js";

import {
  getChatsList,
} from "./ChatsB24.js";

export function getActivityDefinitions(origin) {
  return [
    getCreateEmployeeAccountDefinition(origin),
    getChatsList(origin),
  ];
}