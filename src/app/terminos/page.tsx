import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/pagina-legal";
import { CONTACTO, DIAS_PARA_RECLAMAR, VIGENCIA_TERMINOS } from "@/lib/legal";
import { COMISION_BASE, NIVELES, comisionEnPorcentaje } from "@/lib/niveles";
import { descripcion, publica } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: descripcion(
    "Las condiciones de uso de Seregenera: qué papel cumple la plataforma en una compra, cómo se cobra la comisión, qué obligaciones tiene un proveedor y qué reglas rigen la Comunidad.",
  ),
  ...publica("/terminos"),
};

/**
 * Términos y condiciones de uso.
 *
 * ## Las cifras no están escritas aquí
 *
 * Las comisiones salen de `src/lib/niveles.ts`, que es el gemelo de la migración
 * 0006. Un documento legal que repite un número a mano es un documento que
 * promete una tasa distinta de la que el sistema cobra en cuanto alguien cambia
 * la tabla — y entonces la que vale es la del documento, no la del código. Es el
 * mismo criterio de `/niveles`.
 *
 * ## Lo que este texto dice y conviene no diluir
 *
 * **Seregenera es intermediaria.** El contrato de compraventa se celebra entre
 * la empresa compradora y la proveedora; la plataforma pone el sitio, cobra una
 * comisión y media cuando algo sale mal. Escribirlo de otra forma —«Seregenera
 * te vende»— convertiría a la sociedad en responsable solidaria de la calidad de
 * lo que produce un tercero, que no es el negocio ni lo que puede sostener.
 *
 * **El dinero de la venta es del proveedor, y Seregenera lo recauda por
 * él.** Desde el 2026-10-17 el texto lo dice así (un mandato de recaudo), y
 * dice cuándo se le paga: después de la entrega y del plazo para reclamar
 * (`DIAS_PARA_RECLAMAR`). Es el modelo de Airbnb y de MercadoLibre, y es lo que
 * le da garantía a las dos partes: el comprador sabe que el proveedor no cobra
 * si no entrega, y el proveedor sabe que la plata ya está pagada y esperando.
 * Pendiente de revisión de Ivan y de un contador: quién factura qué.
 */
export default function TerminosPage() {
  const tope = NIVELES[NIVELES.length - 1];

  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      resumen="Qué papel cumple Seregenera cuando compras o vendes aquí, y a qué se compromete cada parte."
      vigenteDesde={VIGENCIA_TERMINOS}
      otro={{
        href: "/privacidad",
        label: "Leer la política de privacidad y cookies →",
      }}
    >
      <h2 id="aceptacion">Al usar el sitio, aceptas estas condiciones</h2>
      <p>
        Seregenera es operado por <strong>{CONTACTO.razonSocial}</strong>,
        sociedad constituida en {CONTACTO.pais} con NIT {CONTACTO.nit}. Al navegar por el sitio aceptas
        estos términos y la{" "}
        <Link href="/privacidad">política de privacidad</Link>. Al crear una
        cuenta, al dar de alta una empresa o al confirmar un pedido los aceptas
        además de forma expresa: cada una de esas pantallas lo dice junto al
        botón, y la fecha queda guardada con tu cuenta, tu empresa o tu orden.
      </p>
      <p>
        Si no estás de acuerdo con algo de lo que sigue, no uses la plataforma.
        Es un contrato, no un formalismo: lo que dice aquí es lo que se puede
        exigir después.
      </p>

      <h2 id="que-es">Qué es Seregenera, y qué no</h2>
      <p>
        Es un <strong>marketplace entre empresas</strong>: conecta compañías del
        sector turístico —hoteles, hostales, glampings, restaurantes,
        transportadores y agencias— con empresas que les venden productos,
        experiencias y servicios regenerativos.
      </p>
      <p>
        <strong>Seregenera no vende lo que aparece en el catálogo.</strong> Cada
        oferta la publica y la despacha su proveedor, y el contrato de
        compraventa se celebra entre la empresa compradora y la proveedora.
        Seregenera pone el sitio donde se encuentran, cobra una comisión sobre la
        venta y media si algo sale mal. Tampoco es un servicio para consumidores
        finales: se compra a nombre de una empresa.
      </p>

      <h2 id="cuenta">Tu cuenta</h2>
      <ul>
        <li>
          Los datos que registras tienen que ser ciertos y estar al día. Si
          compras a nombre de una empresa, declaras que puedes obligarla.
        </li>
        <li>
          Tu contraseña es tuya y no se comparte. Lo que pase desde tu sesión se
          te atribuye a ti, así que si crees que alguien entró, cámbiala y retira
          sus dispositivos desde <Link href="/cuenta">tu cuenta</Link>.
        </li>
        <li>
          Puedes cerrar tu cuenta cuando quieras. Las órdenes ya emitidas se
          conservan por la normativa contable, como explica la política de
          privacidad.
        </li>
      </ul>

      <h2 id="precios">Precios, comisión e impuestos</h2>
      <p>
        Los precios están en <strong>pesos colombianos (COP)</strong> y son los
        que fija cada proveedor. El precio que ves es el que pagas:{" "}
        <strong>la comisión de Seregenera no se suma al comprador</strong>, se
        descuenta de lo que recibe el proveedor.
      </p>
      <p>
        La comisión va del {comisionEnPorcentaje(COMISION_BASE)} % al{" "}
        {comisionEnPorcentaje(tope.comision)} % según el nivel del proveedor y{" "}
        <strong>solo se cobra sobre una venta cerrada</strong>: publicar es
        gratis en cualquier nivel, sin mensualidad ni cobro por destacar. Cada
        orden anota, ítem por ítem, la tasa con la que se calculó, y esa tasa no
        se recalcula después aunque el proveedor suba de nivel. Cómo se gana el
        nivel está en <Link href="/niveles">la página de niveles</Link>.
      </p>
      <p>
        Los impuestos que correspondan se liquidan según la normativa aplicable y
        se reflejan en la factura que emite el proveedor.
      </p>

      <h2 id="pedidos">Pedidos y pago</h2>
      <p>
        Un pedido confirmado congela el título, el precio y el envío de cada
        ítem: lo que aceptaste es lo que queda en la orden, aunque el proveedor
        cambie su catálogo al día siguiente.
      </p>
      <p>
        <strong>Lo que pagas lo recibe {CONTACTO.razonSocial} por cuenta del
        proveedor.</strong> Seregenera lo guarda hasta que el pedido te llega, y
        solo entonces le paga al proveedor lo suyo (cómo, en{" "}
        <a href="#proveedores">«Si vendes aquí»</a>). Si el pedido no llega o se
        cancela, la plata sigue aquí para devolvértela.
      </p>
      <p>
        <strong>Hoy pagas con llave Bre-B o por transferencia</strong> a la
        cuenta de {CONTACTO.razonSocial}, con la referencia de tu orden, y una
        persona del equipo confirma que llegó. Los datos de tu cuenta bancaria no
        pasan por la plataforma. Cuando haya pago en línea, lo procesará una
        pasarela autorizada que recibe ella misma los datos de tu tarjeta o de tu
        cuenta, y se dirá en el momento de pagar.
      </p>
      <p>
        Un pedido sin pagar se cancela solo a las 72 horas, y lo que reservaba
        vuelve al catálogo. Los ítems marcados como <em>cotización</em> no se
        compran directo: se pide un precio y no hay venta hasta que lo aceptas.
      </p>

      <h2 id="envio">Envío y entrega</h2>
      <p>
        Cada proveedor decide cómo llega lo que vende: lo lleva él o lo manda por
        una transportadora que él elige. Al publicar declara cuánto cuesta el
        envío —dentro de su departamento, al resto del país y lo que suma cada
        unidad adicional— y en cuántos días hábiles llega, contados desde que se
        confirma tu pago.
      </p>
      <p>
        <strong>El envío se suma al precio en la cesta, antes de que
        confirmes</strong>, según el departamento de entrega que elijas. Va
        entero al proveedor, para pagar el transporte: Seregenera no cobra
        comisión sobre el envío. Si una oferta no declara tarifa, el envío se
        coordina con el proveedor y no se cobra en la orden.
      </p>
      <p>
        Cuando despacha, el proveedor carga la guía y la sigues desde tu pedido.
        Cuando te llegue, márcalo con «Ya me llegó»; si te lo entregó en mano,
        puede marcarlo él.
      </p>

      <h2 id="reclamos">Si algo sale mal</h2>
      <p>
        Escribe a <a href={`mailto:${CONTACTO.correo}`}>{CONTACTO.correo}</a>{" "}
        con la referencia de tu orden: a más tardar{" "}
        <strong>{DIAS_PARA_RECLAMAR} días hábiles después de la entrega</strong>{" "}
        si lo que llegó no es lo que se publicó o llegó dañado, o en cuanto
        pase el plazo de entrega si no llegó. Seregenera media con el proveedor
        y <strong>no le paga esa venta mientras se resuelve</strong>.
      </p>
      <p>
        La responsabilidad por la calidad, la idoneidad, la seguridad y la
        entrega de lo vendido <strong>es del proveedor</strong>, que es quien
        vende. Las garantías legales que te correspondan las ejerces frente a él;
        Seregenera responde por el funcionamiento de la plataforma y por la
        gestión de la orden. Nada de esto limita los derechos que la ley te
        reconozca de forma imperativa.
      </p>

      <h2 id="proveedores">Si vendes aquí</h2>
      <p>
        Al dar de alta tu empresa aceptas estos términos a nombre de ella, y
        declaras que puedes obligarla. Esto es lo que te toca como proveedor,
        además de todo lo anterior.
      </p>
      <ul>
        <li>
          <strong>Cómo y cuándo cobras.</strong> Lo que paga el comprador lo
          recibe {CONTACTO.razonSocial} por cuenta tuya: le encargas a
          Seregenera que recaude el pago de tus ventas. Cuando el pedido queda
          entregado —lo confirma el comprador, o lo marcas tú si lo entregaste
          en mano— y pasan {DIAS_PARA_RECLAMAR} días hábiles sin un reclamo, te
          transferimos el precio y el envío menos la comisión de tu nivel, a una
          cuenta bancaria a nombre de tu empresa. Si hay un reclamo, ese pago
          espera a que se resuelva; si la venta se cancela o se devuelve, la
          plata vuelve al comprador y no hay comisión.
        </li>
        <li>
          <strong>Despachas en el plazo que prometiste.</strong> El costo y los
          días de entrega que declaras en tu oferta son los que ve y paga el
          comprador. Al despachar, carga la guía en{" "}
          <Link href="/cuenta/empresa/pedidos">tus pedidos</Link>: es lo que le
          deja seguirlo, y lo que dice cuándo llegó.
        </li>
        <li>
          <strong>Facturas tú.</strong> La venta es tuya, así que la factura al
          comprador la emites tú, por el precio y el envío. Seregenera te factura
          a ti su comisión.
        </li>
        <li>
          <strong>Respondes por lo que publicas.</strong> Descripción, precio,
          fotos, impacto declarado y certificaciones tienen que ser ciertos y
          verificables. Una certificación que no puedas sustentar se retira.
        </li>
        <li>
          <strong>Publicas el mismo día, sin esperar aprobación.</strong> A
          cambio, el equipo puede suspender una oferta, una publicación de la
          Comunidad o una empresa entera cuando incumpla estos términos. Suspender
          es reversible y se avisa con el motivo.
        </li>
        <li>
          <strong>El nivel se gana con actividad y no se compra.</strong>{" "}
          Intentar inflarlo —pedidos simulados, reseñas propias, publicaciones
          vacías— es causa de suspensión. El sello de evaluación de
          sostenibilidad es cosa distinta del nivel y lo otorga el equipo tras
          revisar evidencia, como explica{" "}
          <Link href="/verificacion">la metodología</Link>.
        </li>
        <li>
          Tienes que cumplir la normativa que te aplique para lo que vendes:
          registros sanitarios, permisos, facturación electrónica y cualquier
          otra que exija tu actividad y tu país.
        </li>
      </ul>

      <h2 id="comunidad">La Comunidad</h2>
      <p>
        Cualquiera con cuenta puede publicar, a título personal o firmando con
        una empresa que gestione. Lo que se publica es público.
      </p>
      <p>No se permite:</p>
      <ul>
        <li>
          Suplantar a una persona o a una empresa, ni firmar con una que no
          gestiones.
        </li>
        <li>
          Publicar datos personales de terceros, contenido ilegal, ofensivo o
          engañoso.
        </li>
        <li>
          Usar el muro como tablón de anuncios repetido. Una publicación aporta
          algo; diez iguales son ruido.
        </li>
      </ul>
      <p>
        El equipo puede suspender una publicación. Al publicar nos autorizas a
        mostrar ese contenido dentro de la plataforma; sigue siendo tuyo y puedes
        borrarlo cuando quieras.
      </p>

      <h2 id="propiedad">Propiedad intelectual</h2>
      <p>
        La marca Seregenera, el diseño del sitio y sus textos son de{" "}
        {CONTACTO.razonSocial}. Lo que sube cada proveedor —sus fotos, sus textos,
        su logo— sigue siendo suyo, y al publicarlo nos autoriza a mostrarlo en la
        plataforma y en materiales que la promocionen. Si crees que algo publicado
        aquí infringe tus derechos, escríbenos y lo retiramos mientras se aclara.
      </p>

      <h2 id="disponibilidad">Disponibilidad del servicio</h2>
      <p>
        Trabajamos para que el sitio esté siempre disponible, pero no podemos
        garantizar que no haya interrupciones: hay mantenimientos, fallos de
        terceros y cosas que se rompen. No respondemos por lucro cesante ni por
        daños indirectos derivados de una interrupción.
      </p>

      <h2 id="cambios">Cambios en estas condiciones</h2>
      <p>
        Podemos actualizarlas. Cuando lo hagamos cambiará la fecha de vigencia de
        arriba, y si el cambio es sustancial lo avisaremos por correo antes de
        que empiece a aplicar. Seguir usando la plataforma después de esa fecha
        significa que aceptas la versión nueva.
      </p>

      <h2 id="ley">Ley aplicable</h2>
      <p>
        Estas condiciones se rigen por la ley colombiana, que es la del domicilio
        de la sociedad que opera la plataforma. Para cualquier controversia, las
        partes acuden a los jueces competentes de Colombia, sin perjuicio de las
        normas imperativas de protección al consumidor que puedan aplicar en el
        país de residencia de quien usa el servicio.
      </p>
    </PaginaLegal>
  );
}
