import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/pagina-legal";
import { CONTACTO, VIGENCIA_LEGAL } from "@/lib/legal";
import { descripcion, publica } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Política de privacidad y cookies",
  description: descripcion(
    "Qué datos recoge Seregenera, para qué los usa, con quién los comparte y cómo pedir que se corrijan o se borren. Incluye qué cookies usa el sitio y para qué.",
  ),
  ...publica("/privacidad"),
};

/**
 * Política de tratamiento de datos personales.
 *
 * ## Está escrita desde el código, no copiada de una plantilla
 *
 * Cada dato que se nombra aquí existe de verdad en `supabase/migrations/`, y
 * cada encargado que se menciona es un servicio que el repositorio usa. Una
 * política genérica que enumera datos que no se recogen es peor que no tenerla:
 * describe mal el tratamiento, que es exactamente lo que la ley pide que no
 * pase.
 *
 * Si se agrega una tabla con datos de personas, un servicio externo nuevo o una
 * cookie, **esta página es parte del cambio**. La skill `seo-y-legal` lo dice
 * como lista de comprobación.
 *
 * ## Por qué se nombra la ley colombiana y aun así no se asume Colombia
 *
 * La regla 5 de `redaccion-producto` prohíbe citar una ley concreta sin el país
 * delante, porque el sitio acepta proveedores de dieciocho países. Aquí la ley
 * colombiana **sí manda**, y por un motivo que no es el país de quien lee: el
 * responsable del tratamiento es una sociedad colombiana. Lo que se hace es
 * decirlo así —«la sociedad que responde está en Colombia y por eso se rige
 * por…»— y reconocer a continuación que quien esté en otro país conserva los
 * derechos de su propia normativa.
 */
export default function PrivacidadPage() {
  return (
    <PaginaLegal
      titulo="Política de privacidad y cookies"
      resumen="Qué datos tuyos guardamos, para qué, con quién los compartimos y cómo pedir que los corrijamos o los borremos."
      vigenteDesde={VIGENCIA_LEGAL}
      otro={{ href: "/terminos", label: "Leer los términos y condiciones →" }}
    >
      <h2 id="responsable">Quién responde por tus datos</h2>
      <p>
        <strong>Dimension Natural SAS</strong>, sociedad constituida en Colombia,
        es la responsable del tratamiento de los datos personales que se recogen
        en Seregenera. Puedes escribirle a{" "}
        <a href={`mailto:${CONTACTO.correo}`}>{CONTACTO.correo}</a> o llamar al{" "}
        <a href={`tel:${CONTACTO.telefonoE164}`}>{CONTACTO.telefono}</a>.
      </p>
      <p>
        Por estar constituida en Colombia, el tratamiento se rige por la{" "}
        <strong>Ley 1581 de 2012</strong> y el Decreto 1074 de 2015. Si resides
        en otro país, conservas además los derechos que te reconozca tu propia
        normativa de protección de datos; escríbenos a la misma dirección y los
        atendemos igual.
      </p>

      <h2 id="que-recogemos">Qué recogemos y para qué</h2>
      <p>
        Solo lo que hace falta para que el marketplace funcione. Esta tabla es la
        lista completa: no recogemos nada que no esté aquí.
      </p>

      <table>
        <thead>
          <tr>
            <th>Qué</th>
            <th>Cuándo</th>
            <th>Para qué</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Nombre, correo y teléfono</td>
            <td>Al crear tu cuenta</td>
            <td>
              Identificarte al entrar, escribirte sobre tus pedidos y firmar lo
              que publiques en la Comunidad
            </td>
          </tr>
          <tr>
            <td>Nombre de tu empresa y documento tributario</td>
            <td>Al comprar como empresa o al dar de alta una proveedora</td>
            <td>Emitir la factura y cumplir las obligaciones contables</td>
          </tr>
          <tr>
            <td>Foto de perfil o logo</td>
            <td>Solo si decides subirlos</td>
            <td>
              Identificarte en la Comunidad y en tu ficha. <strong>Son
              públicos</strong>: los ve cualquiera que entre al sitio
            </td>
          </tr>
          <tr>
            <td>Tus pedidos: qué compraste, a quién y por cuánto</td>
            <td>Al confirmar una orden</td>
            <td>
              Gestionar la entrega, liquidar al proveedor y poder auditar la
              operación después
            </td>
          </tr>
          <tr>
            <td>Lo que publicas en la Comunidad</td>
            <td>Al publicar</td>
            <td>
              Mostrarlo en el muro. <strong>Es público</strong>, con tu nombre
              y la empresa con la que firmes
            </td>
          </tr>
          <tr>
            <td>Tus reacciones a lo que publican otros</td>
            <td>Al reaccionar</td>
            <td>
              Contarlas. <strong>Quién reaccionó a qué solo lo ves tú</strong>:
              en la tarjeta aparece el número, nunca la lista de personas
            </td>
          </tr>
          <tr>
            <td>
              Los dispositivos en los que confías: una etiqueta («Chrome en
              Windows») y un identificador aleatorio cifrado
            </td>
            <td>Al entrar con el código de seis dígitos</td>
            <td>
              No volver a pedirte el código en ese aparato. Puedes retirarlos
              desde tu cuenta cuando quieras
            </td>
          </tr>
          <tr>
            <td>Los datos de la postulación de un proveedor</td>
            <td>Al mandar el formulario de «Vender en Seregenera»</td>
            <td>
              Crear la ficha de la empresa y contactarte. Se guarda además{" "}
              <strong>la fecha en que autorizaste</strong> el tratamiento, que
              es lo que permite demostrar el consentimiento
            </td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>No usamos tus datos para publicidad</strong>, no los vendemos y
        no los cedemos a terceros con fines comerciales. No hacemos elaboración
        de perfiles ni decisiones automatizadas que te afecten: el nivel de un
        proveedor se calcula con su propia actividad y está explicado, paso por
        paso, en <Link href="/niveles">la página de niveles</Link>.
      </p>

      <h2 id="contrasena">Tu contraseña</h2>
      <p>
        No la conocemos. La guarda nuestro proveedor de identidad cifrada con un
        algoritmo de un solo sentido, y lo que se comprueba al entrar es el
        cifrado, nunca el texto. Por eso, si la olvidas, no podemos decírtela:
        solo podemos dejarte poner otra.
      </p>

      <h2 id="encargados">Con quién los compartimos</h2>
      <p>
        Con nadie más que con quienes nos prestan la infraestructura, y solo en
        lo que su servicio necesita. Ninguno puede usarlos para otra cosa.
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — base de datos, cuentas y almacenamiento de
          las imágenes que subes.
        </li>
        <li>
          <strong>Vercel</strong> — servidores donde corre el sitio.
        </li>
        <li>
          <strong>El servicio de correo</strong> que entrega los mensajes de
          acceso y los avisos de tus pedidos.
        </li>
        <li>
          <strong>La pasarela de pago</strong>, cuando pagues en línea. Hoy los
          pagos se coordinan por transferencia y no interviene ninguna: los
          datos de tu cuenta bancaria no pasan por Seregenera ni se guardan aquí.
        </li>
      </ul>
      <p>
        Esos servicios operan en servidores fuera de Colombia, así que tus datos
        salen del país. Trabajamos con proveedores que ofrecen las garantías de
        seguridad y confidencialidad que exige la normativa aplicable, y el
        acceso a los datos está limitado por las reglas de seguridad de nuestra
        propia base: un proveedor no puede leer los pedidos de otro ni los datos
        de un comprador que no le compró.
      </p>

      <h2 id="cuanto">Cuánto tiempo los guardamos</h2>
      <ul>
        <li>
          <strong>Mientras tengas cuenta.</strong> Si la cierras, se borran los
          datos de tu perfil y lo que publicaste en la Comunidad.
        </li>
        <li>
          <strong>Las órdenes y facturas se conservan aunque cierres la
          cuenta</strong>, por el plazo que exige la normativa contable y
          tributaria. No es una decisión nuestra y no podemos saltárnosla.
        </li>
        <li>
          <strong>Los dispositivos de confianza</strong> caducan solos y los
          puedes retirar antes desde tu cuenta.
        </li>
      </ul>

      <h2 id="derechos">Qué puedes pedirnos</h2>
      <p>
        En cualquier momento, y sin tener que explicar por qué:{" "}
        <strong>conocer</strong> qué datos tuyos tenemos,{" "}
        <strong>actualizarlos</strong>, <strong>rectificarlos</strong>,{" "}
        <strong>pedir que los borremos</strong> y{" "}
        <strong>revocar la autorización</strong> que nos diste. También puedes
        pedir copia de la autorización y saber qué uso les hemos dado.
      </p>
      <p>
        Muchas de esas cosas las puedes hacer tú desde{" "}
        <Link href="/cuenta">tu cuenta</Link> sin escribirle a nadie. Para el
        resto, escribe a{" "}
        <a href={`mailto:${CONTACTO.correo}`}>{CONTACTO.correo}</a> desde el
        correo de tu cuenta. Respondemos las consultas dentro de los diez días
        hábiles siguientes y los reclamos dentro de los quince, que son los
        plazos de la Ley 1581.
      </p>
      <p>
        Si consideras que no te atendimos bien, puedes acudir a la
        Superintendencia de Industria y Comercio, que es la autoridad de
        protección de datos en Colombia.
      </p>

      <h2 id="menores">Menores de edad</h2>
      <p>
        Seregenera es una plataforma entre empresas y no está dirigida a menores
        de edad. No recogemos datos de menores a sabiendas; si detectamos una
        cuenta de un menor, la cerramos y borramos sus datos.
      </p>

      <h2 id="cookies">Cookies: cuáles usamos y para qué</h2>
      <p>
        Una cookie es un archivo pequeño que el sitio deja en tu navegador para
        reconocerte entre una página y la siguiente. Seregenera usa{" "}
        <strong>solo las que necesita para funcionar</strong>. No hay cookies de
        publicidad, ni de redes sociales, ni de seguimiento entre sitios.
      </p>

      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Para qué</th>
            <th>Cuánto dura</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              Cookies de sesión (<code>sb-…</code>)
            </td>
            <td>
              Mantener tu sesión abierta al pasar de una página a otra. Sin
              ellas, tendrías que volver a entrar en cada clic
            </td>
            <td>Hasta que cierras sesión</td>
          </tr>
          <tr>
            <td>
              <code>sgr_dispositivo</code>
            </td>
            <td>
              Reconocer este aparato como de confianza y no volver a pedirte el
              código de seis dígitos
            </td>
            <td>Un año, o hasta que lo retires desde tu cuenta</td>
          </tr>
          <tr>
            <td>
              <code>sgr_cookies</code>
            </td>
            <td>Recordar qué decidiste en el aviso de cookies</td>
            <td>Un año</td>
          </tr>
        </tbody>
      </table>

      <p>
        Tu carrito no es una cookie: vive en el almacenamiento local de tu
        navegador y no se manda a ningún servidor hasta que confirmas la compra.
        Guarda qué oferta y cuántas unidades, nunca un precio — el precio lo
        calcula el servidor en cada cambio.
      </p>

      <h3>Medición de uso</h3>
      <p>
        Hoy <strong>no hay ninguna herramienta de analítica en el sitio</strong>.
        Si algún día la hay, solo se activará si la autorizas en el aviso de
        cookies, y esta página dirá cuál es antes de que empiece a funcionar.
        Puedes cambiar tu decisión cuando quieras desde el enlace «Cookies» del
        pie de página.
      </p>
      <p>
        Bloquear las cookies necesarias desde tu navegador es posible, pero
        entonces no podrás mantener la sesión abierta ni comprar.
      </p>

      <h2 id="cambios">Si esto cambia</h2>
      <p>
        Cuando actualicemos esta política, cambiaremos la fecha de vigencia de
        arriba. Si el cambio afecta a para qué usamos tus datos, te lo avisamos
        por correo antes de que empiece a aplicar.
      </p>
    </PaginaLegal>
  );
}
