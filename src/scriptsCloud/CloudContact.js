export async function getTokenCloud(env){
  const responseToken = await fetch(
    "https://energyteam.hostedcc.ru/configapi/v2/oauth/token",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },

      body: new URLSearchParams({
        client_id: env.CLOUD_CONTACT_CLIENT_ID,
        client_secret: env.CLOUD_CONTACT_CLIENT_SECRET,
        scope: "energyteam.hostedcc.ru",
        grant_type: "client_credentials"
      })
    }
  );

  // Проверка на ошибку, вывод лога
  if (!responseToken.ok) {
    const error = await responseToken.text();
    throw new Error(
      `Cloud Contact OAuth HTTP ${responseToken.status}: ${error}`
    );
  }
  return await responseToken.json();
}

// вызываем функцию
const accessToken = await getTokenCloud(env);


// Получение поль зователей, использую 2 хука и слияние(В будущем возможность оптимизировать для более бысмтрого выполнение скрипта), либо используем кэширование
export async function userslistLoginCloud(env) {
  const responseUsersPhoneList = await fetch(
    "https://energyteam.hostedcc.ru/configapi/v2/phone/user",
    {
      method: "GET",
      headers:{
        "Content-Type": "application/scim+json",
        "Authorization": `Bearer ${accessToken}`
      },
    }  
  );

  if(!responseUsersPhoneList.ok){
    const error = await responseUsersPhoneList.text();
    throw new Error(
      `Error list phone: ${responseUsersPhoneList.status}: ${error}`
    );
  }
}
  // вытаскиваем данные loginId для 2-ого запроса по всей ифнормации по каждому пользователю
  const loginIdData = await responseUsersPhoneList.json();

  const userslistCloud = await Promise.all(
    loginIdData.map(async (user) => {

    const loginId = user.loginId;
      // Подробная информация по всем пользователям
    const responseUsersList = await fetch(
      `https://energyteam.hostedcc.ru/configapi/v2/user/${encodeURIComponent(loginId)}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json"
        }
      }
    );

    if (!responseUsersList.ok) {
      const error = await responseUsersList.text();
      throw new Error(
        `Error user ${loginId}: ${responseUsersList.status}: ${error}`
      );
    }

    return await responseUsersList.json();
  })
);







  // Собираем пользователя для uuid
  